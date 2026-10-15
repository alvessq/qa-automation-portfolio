// Baixa o APK público do Sauce Labs My Demo App a partir dos releases do GitHub.
// Usa MDA_RELEASE_TAG para fixar uma versão; sem ela, pega o último release.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { resolveFromWorkspace } from './lib/paths.mjs';

const REPO = 'saucelabs/my-demo-app-android';
const tag = process.env.MDA_RELEASE_TAG?.trim();
const target = resolveFromWorkspace(process.env.APP_PATH || './apps/my-demo-app.apk');
const force = process.argv.includes('--force');
// --refresh: baixa de novo só se saiu um release diferente do que está no disco.
const refresh = process.argv.includes('--refresh');

if (fs.existsSync(target) && !force && !refresh) {
  console.log(`[apk] já existe: ${path.relative(process.cwd(), target)} (use --force para baixar de novo)`);
  process.exit(0);
}

const releaseUrl = tag
  ? `https://api.github.com/repos/${REPO}/releases/tags/${tag}`
  : `https://api.github.com/repos/${REPO}/releases/latest`;

const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'qa-automation-portfolio' };
// Na CI o token evita o limite de requisições anônimas da API.
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

const release = await fetchJson(releaseUrl, headers);
const current = refresh && !force && fs.existsSync(target) ? readMeta(`${target}.json`)?.release : undefined;

// Sem process.exit() depois de um fetch: no Windows o Node pode abortar ao
// encerrar com sockets ainda fechando. Deixamos o script terminar sozinho.
if (current && current === release.tag_name) {
  console.log(`[apk] já está no release mais recente (${current})`);
} else {
  if (refresh && fs.existsSync(target)) console.log(`[apk] release novo: ${current ?? 'desconhecido'} → ${release.tag_name}`);
  await download(release);
}

async function download(release) {
// O release também traz o APK de instrumentação (androidTest); queremos só o app.
  const asset = release.assets.find((a) => a.name.endsWith('.apk') && !a.name.includes('androidTest'));
  if (!asset) {
    console.error(`[apk] nenhum .apk encontrado no release ${release.tag_name}`);
    process.exitCode = 1;
    return;
  }

  console.log(`[apk] baixando ${asset.name} (${(asset.size / 1024 / 1024).toFixed(1)} MB) do release ${release.tag_name}`);
  const response = await fetch(asset.browser_download_url, { headers: { 'User-Agent': headers['User-Agent'] } });
  if (!response.ok) {
    console.error(`[apk] download falhou: HTTP ${response.status}`);
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
  fs.writeFileSync(`${target}.json`, JSON.stringify({ release: release.tag_name, asset: asset.name }, null, 2));
  console.log(`[apk] salvo em ${path.relative(process.cwd(), target)}`);
}

function readMeta(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

async function fetchJson(url, requestHeaders) {
  const res = await fetch(url, { headers: requestHeaders });
  if (!res.ok) {
    console.error(`[apk] GitHub API respondeu HTTP ${res.status} para ${url}`);
    process.exit(1);
  }
  return res.json();
}
