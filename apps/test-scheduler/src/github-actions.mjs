// Nuvem pelo painel: execuções dos workflows do GitHub Actions, disparo manual
// (workflow_dispatch), cancelamento e evidências (logs, vídeo e screenshots).
// Ler a lista funciona sem token em repositório público, com limite de
// requisições; disparar, cancelar e baixar logs e evidências exige GITHUB_TOKEN.
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';

export const MOBILE_SPECS = ['catalog', 'login', 'product-details', 'cart', 'checkout', 'logout'];

/** Workflows que o painel conhece, com os inputs aceitos no disparo. */
export const WORKFLOWS = [
  { file: 'ci.yml', name: 'CI', inputs: {} },
  { file: 'mobile-e2e.yml', name: 'Mobile E2E (emulador na nuvem)', inputs: { suite: ['smoke', 'regression', 'spec'], specName: MOBILE_SPECS } },
  { file: 'web-monitoring.yml', name: 'Monitoramento web', inputs: {} },
];

export function findWorkflow(file) {
  return WORKFLOWS.find((w) => w.file === file) ?? null;
}

/** Só aceita inputs conhecidos e com valores da lista. Devolve { inputs } ou { error }. */
export function validateInputs(workflow, inputs = {}) {
  const clean = {};
  for (const [key, value] of Object.entries(inputs ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    const allowed = workflow.inputs[key];
    if (!allowed) return { error: `input "${key}" não existe em ${workflow.file}` };
    if (!allowed.includes(String(value))) return { error: `${key} deve ser um de: ${allowed.join(', ')}` };
    clean[key] = String(value);
  }
  if (workflow.inputs.specName) {
    if (clean.suite === 'spec' && !clean.specName) return { error: 'suite = spec exige specName' };
    if (clean.suite !== 'spec') delete clean.specName;
  }
  return { inputs: clean };
}

/**
 * O mobile-e2e.yml nomeia cada execução com o alvo (run-name):
 * "Mobile E2E · smoke", "Mobile E2E · regression", "Mobile E2E · spec login".
 */
export function targetOfRun(name = '') {
  const match = /·\s*(smoke|regression|spec ([a-z-]+))\s*$/.exec(name);
  if (!match) return null;
  return match[2] ? `spec:${match[2]}` : match[1];
}

const summarizeRun = (run) => ({
  id: run.id,
  runNumber: run.run_number,
  name: run.display_title || run.name,
  target: targetOfRun(run.display_title || run.name),
  event: run.event,
  status: run.status,
  conclusion: run.conclusion,
  branch: run.head_branch,
  createdAt: run.created_at,
  runStartedAt: run.run_started_at,
  updatedAt: run.updated_at,
  url: run.html_url,
});

const MEDIA_TYPES = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.png': 'image/png', '.jpg': 'image/jpeg' };
const LOG_TAIL_CHARS = 60_000;

/** Junta os logs dos passos (um .txt por passo no zip), sem o carimbo de hora de cada linha. */
export function logsFromZip(buffer) {
  const zip = new AdmZip(Buffer.from(buffer));
  const steps = zip
    .getEntries()
    .filter((e) => !e.isDirectory && e.entryName.includes('/') && e.entryName.endsWith('.txt'))
    .sort((a, b) => a.entryName.localeCompare(b.entryName, undefined, { numeric: true }));
  const text = steps
    .map((e) => `── ${e.entryName.split('/').pop().replace(/^\d+_/, '').replace(/\.txt$/, '')}\n${e.getData().toString('utf8')}`)
    .join('\n')
    .replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z /gm, '');
  return text.slice(-LOG_TAIL_CHARS);
}

/** Extrai vídeos e imagens do zip de um artifact para `dir`. Devolve a lista. */
export function mediaFromZip(buffer, dir) {
  const zip = new AdmZip(Buffer.from(buffer));
  const media = [];
  for (const entry of zip.getEntries()) {
    const type = MEDIA_TYPES[path.extname(entry.entryName).toLowerCase()];
    if (entry.isDirectory || !type) continue;
    const name = path.basename(entry.entryName);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), entry.getData());
    media.push({ name, type, size: entry.header.size });
  }
  return media;
}

export function createGithubActions({ repository, token, fetchImpl = fetch, cacheMs, now = () => Date.now(), mediaDir }) {
  const cache = new Map();
  // Sem token a API permite 60 requisições por hora: o cache precisa ser maior.
  const ttl = cacheMs ?? (token ? 15_000 : 60_000);
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'qa-automation-portfolio-scheduler',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  async function request(method, urlPath, body) {
    const response = await fetchImpl(`https://api.github.com/repos/${repository}${urlPath}`, {
      method,
      headers: body ? { ...headers, 'Content-Type': 'application/json' } : headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.status === 404) throw new Error(`${repository} ou o workflow não foi encontrado (o repositório já foi publicado?)`);
    if ((response.status === 403 || response.status === 429) && response.headers?.get('x-ratelimit-remaining') === '0') {
      const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000;
      const minutes = reset ? Math.max(1, Math.ceil((reset - Date.now()) / 60_000)) : null;
      throw new Error(
        `limite de consultas ao GitHub esgotado${token ? '' : ' (sem token são 60 por hora)'}${minutes ? `; libera em ${minutes} min` : ''}. Com GITHUB_TOKEN o limite sobe para 5000 por hora.`,
      );
    }
    if (!response.ok) throw new Error(`GitHub respondeu HTTP ${response.status}`);
    return response;
  }
  const call = async (method, urlPath, body) => {
    const response = await request(method, urlPath, body);
    return response.status === 204 || response.status === 202 ? null : response.json();
  };

  const requireRepo = () => {
    if (!repository) throw new Error('defina GITHUB_REPOSITORY para ver as execuções da nuvem');
  };
  const requireToken = (what) => {
    requireRepo();
    if (!token) throw new Error(`defina GITHUB_TOKEN (Actions: read and write) para ${what}`);
  };

  return {
    configured: { read: Boolean(repository), dispatch: Boolean(repository && token) },

    /** Execuções recentes de um workflow, com cache para não estourar o limite da API. */
    async runs(file, perPage = 50) {
      requireRepo();
      if (!findWorkflow(file)) throw new Error(`workflow desconhecido: ${file}`);
      const key = `runs:${file}`;
      const hit = cache.get(key);
      if (hit && now() - hit.at < ttl) return hit.value;
      const data = await call('GET', `/actions/workflows/${file}/runs?per_page=${perPage}`);
      const value = data.workflow_runs.map(summarizeRun);
      cache.set(key, { at: now(), value });
      return value;
    },

    /** Há execução na fila ou rodando? Usado pela agenda para disparar uma de cada vez. */
    async isIdle(file) {
      cache.delete(`runs:${file}`);
      const runs = await this.runs(file, 10);
      return !runs.some((run) => run.status !== 'completed');
    },

    sync() {
      cache.clear();
    },

    async dispatch(file, inputs, ref = 'main') {
      const workflow = findWorkflow(file);
      if (!workflow) throw new Error(`workflow desconhecido: ${file}`);
      requireToken('disparar pela nuvem');
      const checked = validateInputs(workflow, inputs);
      if (checked.error) throw new Error(checked.error);
      await call('POST', `/actions/workflows/${file}/dispatches`, { ref, inputs: checked.inputs });
      cache.delete(`runs:${file}`);
      return { workflow: file, inputs: checked.inputs, ref };
    },

    async cancel(runId) {
      requireToken('cancelar execuções');
      await call('POST', `/actions/runs/${Number(runId)}/cancel`);
      cache.clear();
    },

    async logs(runId) {
      requireToken('ver os logs da nuvem');
      const response = await request('GET', `/actions/runs/${Number(runId)}/logs`);
      return logsFromZip(await response.arrayBuffer());
    },

    /** Vídeos e screenshots dos artifacts da execução, baixados uma vez e guardados em disco. */
    async media(runId) {
      requireToken('ver as evidências da nuvem');
      const dir = path.join(mediaDir, String(Number(runId)));
      const index = path.join(dir, 'media.json');
      if (fs.existsSync(index)) return JSON.parse(fs.readFileSync(index, 'utf8'));
      const { artifacts } = await call('GET', `/actions/runs/${Number(runId)}/artifacts`);
      const media = [];
      for (const artifact of artifacts.filter((a) => !a.expired)) {
        const response = await request('GET', `/actions/artifacts/${artifact.id}/zip`);
        media.push(...mediaFromZip(await response.arrayBuffer(), dir));
      }
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(index, JSON.stringify(media));
      return media;
    },

    mediaPath(runId, name) {
      const file = path.join(mediaDir, String(Number(runId)), path.basename(String(name)));
      return MEDIA_TYPES[path.extname(file).toLowerCase()] && fs.existsSync(file) ? file : null;
    },
  };
}
