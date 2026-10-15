// Nuvem pelo painel: últimas execuções dos workflows do GitHub Actions e disparo
// manual (workflow_dispatch). Ler funciona sem token em repositório público
// (com limite de requisições); disparar exige GITHUB_TOKEN com Actions: write.

/** Workflows que o painel conhece, com os inputs aceitos no disparo. */
export const WORKFLOWS = [
  { file: 'ci.yml', name: 'CI', inputs: {} },
  { file: 'mobile-e2e.yml', name: 'Mobile E2E (emulador na nuvem)', inputs: { suite: ['smoke', 'regression'] } },
  { file: 'web-monitoring.yml', name: 'Monitoramento web', inputs: {} },
];

export function findWorkflow(file) {
  return WORKFLOWS.find((w) => w.file === file) ?? null;
}

/** Só aceita inputs conhecidos e com valores da lista. Devolve { inputs } ou { error }. */
export function validateInputs(workflow, inputs = {}) {
  const clean = {};
  for (const [key, value] of Object.entries(inputs ?? {})) {
    const allowed = workflow.inputs[key];
    if (!allowed) return { error: `input "${key}" não existe em ${workflow.file}` };
    if (!allowed.includes(String(value))) return { error: `${key} deve ser um de: ${allowed.join(', ')}` };
    clean[key] = String(value);
  }
  return { inputs: clean };
}

const summarizeRun = (run) => ({
  id: run.id,
  title: run.display_title || run.name,
  event: run.event,
  status: run.status,
  conclusion: run.conclusion,
  branch: run.head_branch,
  createdAt: run.created_at,
  url: run.html_url,
});

export function createGithubActions({ repository, token, fetchImpl = fetch, cacheMs = 60_000, now = () => Date.now() }) {
  const cache = new Map();
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'qa-automation-portfolio-scheduler',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  async function call(method, path, body) {
    const response = await fetchImpl(`https://api.github.com/repos/${repository}${path}`, {
      method,
      headers: body ? { ...headers, 'Content-Type': 'application/json' } : headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.status === 404) throw new Error(`${repository} ou o workflow não foi encontrado (o repositório já foi publicado?)`);
    if (!response.ok) throw new Error(`GitHub respondeu HTTP ${response.status}`);
    return response.status === 204 ? null : response.json();
  }

  return {
    configured: { read: Boolean(repository), dispatch: Boolean(repository && token) },

    /** Últimas execuções de cada workflow, com cache para não estourar o limite da API. */
    async overview(perWorkflow = 5) {
      if (!repository) return { error: 'defina GITHUB_REPOSITORY para ver as execuções da nuvem', workflows: [] };
      const hit = cache.get('overview');
      if (hit && now() - hit.at < cacheMs) return hit.value;
      let value;
      try {
        const workflows = await Promise.all(
          WORKFLOWS.map(async (wf) => {
            const data = await call('GET', `/actions/workflows/${wf.file}/runs?per_page=${perWorkflow}`);
            return { ...wf, runs: data.workflow_runs.map(summarizeRun) };
          }),
        );
        value = { error: null, workflows };
      } catch (error) {
        value = { error: error.message, workflows: [] };
      }
      cache.set('overview', { at: now(), value });
      return value;
    },

    async dispatch(file, inputs, ref = 'main') {
      const workflow = findWorkflow(file);
      if (!workflow) throw new Error(`workflow desconhecido: ${file}`);
      if (!token) throw new Error('defina GITHUB_TOKEN (Actions: read and write) para disparar pela nuvem');
      const checked = validateInputs(workflow, inputs);
      if (checked.error) throw new Error(checked.error);
      await call('POST', `/actions/workflows/${file}/dispatches`, { ref, inputs: checked.inputs });
      cache.delete('overview');
      return { workflow: file, inputs: checked.inputs, ref };
    },
  };
}
