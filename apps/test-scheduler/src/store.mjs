// Persistência simples em JSON: jobs em config.json (versionado) e histórico
// em data/history.json (fora do Git). Escrita atômica via arquivo temporário.
import fs from 'node:fs';
import path from 'node:path';

export function createStore({ configFile, historyFile, historyLimit, verdictsFile, verdictsLimit = 100 }) {
  const readJson = (file, fallback) => {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return fallback;
    }
  };

  const writeJson = (file, data) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
    fs.renameSync(tmp, file);
  };

  let jobs = readJson(configFile, { jobs: [] }).jobs;
  let history = readJson(historyFile, []);
  let verdicts = verdictsFile ? readJson(verdictsFile, []) : [];

  return {
    listJobs: () => jobs,
    getJob: (id) => jobs.find((job) => job.id === id),

    saveJob(job) {
      const index = jobs.findIndex((j) => j.id === job.id);
      jobs = index === -1 ? [...jobs, job] : jobs.map((j, i) => (i === index ? job : j));
      writeJson(configFile, { jobs });
      return job;
    },

    deleteJob(id) {
      const before = jobs.length;
      jobs = jobs.filter((job) => job.id !== id);
      writeJson(configFile, { jobs });
      return jobs.length !== before;
    },

    listHistory: () => history,

    lastStartedAt(jobId) {
      return history.find((run) => run.jobId === jobId)?.startedAt ?? null;
    },

    /** Insere ou atualiza uma execução; o histórico fica do mais novo para o mais antigo. */
    saveRun(run) {
      const index = history.findIndex((r) => r.runId === run.runId);
      history = index === -1 ? [run, ...history] : history.map((r, i) => (i === index ? run : r));
      history = history.slice(0, historyLimit);
      writeJson(historyFile, history);
    },

    clearHistory() {
      history = [];
      writeJson(historyFile, history);
    },

    listVerdicts: () => verdicts,

    /** Vereditos da triagem, do mais novo para o mais antigo. */
    saveVerdict(verdict) {
      const index = verdicts.findIndex((v) => v.id === verdict.id);
      verdicts = index === -1 ? [verdict, ...verdicts] : verdicts.map((v, i) => (i === index ? verdict : v));
      verdicts = verdicts.slice(0, verdictsLimit);
      if (verdictsFile) writeJson(verdictsFile, verdicts);
    },
  };
}
