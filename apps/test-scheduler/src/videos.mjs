// Vídeos das execuções locais. As suítes gravam a tela e só guardam o arquivo
// quando o teste falha (mobile: .mp4; web: .webm do Playwright). Ao fim de
// cada execução, o vídeo novo é copiado para data/videos com o id do job, e
// ficam os 3 mais recentes de cada um.
import fs from 'node:fs';
import path from 'node:path';

export const VIDEOS_PER_JOB = 3;
const NAME_PATTERN = /^[a-z0-9-]+__[0-9TZ-]+\.(mp4|webm)$/;

/** Onde cada workspace deixa os vídeos de falha. */
const SOURCES = {
  'mobile-e2e': ['test-results/videos'],
  'web-e2e': ['test-results/artifacts'],
};

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(mp4|webm)$/.test(entry.name) ? [full] : [];
  });
}

export function isVideoName(name) {
  return NAME_PATTERN.test(String(name));
}

export function createVideos({ dir, appsDir, keep = VIDEOS_PER_JOB }) {
  const list = () =>
    fs.existsSync(dir)
      ? fs
          .readdirSync(dir)
          .filter(isVideoName)
          .map((name) => {
            const stat = fs.statSync(path.join(dir, name));
            return { name, jobId: name.split('__')[0], size: stat.size, modifiedAt: stat.mtime.toISOString() };
          })
          .sort((a, b) => b.name.localeCompare(a.name))
      : [];

  function prune(jobId) {
    for (const old of list().filter((v) => v.jobId === jobId).slice(keep)) fs.rmSync(path.join(dir, old.name), { force: true });
  }

  return {
    list,

    /** Copia o vídeo mais novo gerado durante a execução. Devolve o nome ou null. */
    collect(job, run) {
      const since = Date.parse(run.startedAt) - 1000;
      const fresh = (SOURCES[job.workspace] ?? [])
        .flatMap((relative) => walk(path.join(appsDir, job.workspace, relative)))
        .map((file) => ({ file, mtime: fs.statSync(file).mtimeMs }))
        .filter((v) => v.mtime >= since)
        .sort((a, b) => b.mtime - a.mtime)[0];
      if (!fresh) return null;
      fs.mkdirSync(dir, { recursive: true });
      const stamp = new Date(run.startedAt).toISOString().replace(/[:.]/g, '-');
      const name = `${job.id}__${stamp}${path.extname(fresh.file)}`;
      fs.copyFileSync(fresh.file, path.join(dir, name));
      prune(job.id);
      return name;
    },

    /** Caminho do arquivo só para nomes no formato gerado aqui (sem ../). */
    pathOf(name) {
      if (!isVideoName(name)) return null;
      const file = path.join(dir, name);
      return fs.existsSync(file) ? file : null;
    },

    clear(jobIds = null) {
      for (const { name } of list().filter((v) => !jobIds || jobIds.includes(v.jobId))) fs.rmSync(path.join(dir, name), { force: true });
    },
  };
}
