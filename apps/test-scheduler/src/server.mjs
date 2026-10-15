import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import cron from 'node-cron';
import { isDue, nextRunAt } from './schedule-window.mjs';
import { loadAvailableScripts, validateJob } from './job-validation.mjs';
import { createStore } from './store.mjs';
import { createRunner } from './runner.mjs';
import { createTriage, DEFAULT_RETRIES } from './triage.mjs';
import { createNotifier } from './notifier.mjs';

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(APP_DIR, '..', '..');
dotenv.config({ path: path.join(APP_DIR, '.env'), quiet: true });

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT) || 7400;
const TIME_ZONE = process.env.SCHEDULER_TZ || 'America/Sao_Paulo';

const store = createStore({
  configFile: path.join(APP_DIR, 'config.json'),
  historyFile: path.join(APP_DIR, 'data', 'history.json'),
  historyLimit: Number(process.env.HISTORY_LIMIT) || 200,
  verdictsFile: path.join(APP_DIR, 'data', 'triage.json'),
});

const triage = createTriage({ retries: Number(process.env.TRIAGE_RETRIES ?? DEFAULT_RETRIES) });
const notifier = createNotifier({
  repository: process.env.GITHUB_REPOSITORY,
  token: process.env.GITHUB_TOKEN,
  webhookUrl: process.env.TRIAGE_WEBHOOK_URL,
});

const runner = createRunner({
  store,
  repoRoot: REPO_ROOT,
  onFinish(job, run) {
    const step = triage.handle(job, run);
    if (step.action === 'retry') {
      console.log(`[triagem] ${job.name}: repetição ${step.attempt}`);
      runner.enqueue(job, 'triagem', { front: true });
    } else if (step.action === 'verdict') {
      const { verdict } = step;
      store.saveVerdict({ ...verdict, notification: { pending: true } });
      console.log(`[triagem] ${job.name}: ${verdict.kind}`);
      notifier.notify(verdict, run.output).then((notification) => store.saveVerdict({ ...verdict, notification }));
    }
  },
});
const availableScripts = loadAvailableScripts(path.join(REPO_ROOT, 'apps'));

let paused = process.env.START_PAUSED === 'true';

// Tick a cada minuto: enfileira os jobs ativos, dentro da janela e vencidos.
cron.schedule(
  '* * * * *',
  () => {
    if (paused) return;
    const now = new Date();
    for (const job of store.listJobs()) {
      if (isDue(job, store.lastStartedAt(job.id), now, TIME_ZONE)) runner.enqueue(job, 'schedule');
    }
  },
  { timezone: TIME_ZONE },
);

const app = express();
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(APP_DIR, 'public')));

app.get('/api/status', (_req, res) => {
  const now = new Date();
  const lastRunByJob = new Map();
  for (const run of store.listHistory()) if (!lastRunByJob.has(run.jobId)) lastRunByJob.set(run.jobId, run);

  res.json({
    paused,
    timeZone: TIME_ZONE,
    ...runner.state(),
    jobs: store.listJobs().map((job) => {
      const last = lastRunByJob.get(job.id);
      return {
        ...job,
        lastRun: last ? { runId: last.runId, status: last.status, startedAt: last.startedAt, durationMs: last.durationMs } : null,
        nextRunAt: paused ? null : nextRunAt(job, last?.startedAt, now, TIME_ZONE),
      };
    }),
  });
});

app.get('/api/scripts', (_req, res) => res.json(availableScripts));

app.get('/api/history', (_req, res) => {
  res.json(store.listHistory().map(({ output: _output, ...run }) => run));
});

app.get('/api/history/:runId', (req, res) => {
  const run = store.listHistory().find((r) => r.runId === req.params.runId);
  if (!run) return res.status(404).json({ error: 'execução não encontrada' });
  res.json({ ...run, output: runner.liveOutput(run.runId) ?? run.output });
});

app.get('/api/triage', (_req, res) => {
  res.json({ channels: notifier.channels, active: triage.active(), verdicts: store.listVerdicts() });
});

app.delete('/api/history', (_req, res) => {
  store.clearHistory();
  res.status(204).end();
});

app.post('/api/pause', (req, res) => {
  paused = req.body?.paused !== false;
  res.json({ paused });
});

app.post('/api/jobs/:id/run', (req, res) => {
  const job = store.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'job não encontrado' });
  const result = runner.enqueue(job, 'manual');
  res.status(result.queued ? 202 : 409).json(result);
});

app.post('/api/jobs/:id/stop', (req, res) => {
  triage.cancel(req.params.id);
  const stopped = runner.stop(req.params.id) || runner.dequeue(req.params.id);
  res.status(stopped ? 200 : 409).json({ stopped });
});

app.post('/api/jobs', (req, res) => {
  const { job, errors } = validateJob(req.body, availableScripts);
  if (errors) return res.status(400).json({ errors });
  if (store.getJob(job.id)) return res.status(409).json({ errors: [`já existe um job com id "${job.id}"`] });
  res.status(201).json(store.saveJob(job));
});

app.put('/api/jobs/:id', (req, res) => {
  if (!store.getJob(req.params.id)) return res.status(404).json({ error: 'job não encontrado' });
  const { job, errors } = validateJob({ ...req.body, id: req.params.id }, availableScripts);
  if (errors) return res.status(400).json({ errors });
  res.json(store.saveJob(job));
});

app.patch('/api/jobs/:id/enabled', (req, res) => {
  const job = store.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'job não encontrado' });
  res.json(store.saveJob({ ...job, enabled: Boolean(req.body?.enabled) }));
});

app.delete('/api/jobs/:id', (req, res) => {
  triage.cancel(req.params.id);
  runner.dequeue(req.params.id);
  res.status(store.deleteJob(req.params.id) ? 204 : 404).end();
});

// No Express 5 o callback do listen recebe o erro (ex.: porta ocupada).
app.listen(PORT, HOST, (error) => {
  if (error) {
    console.error(`[scheduler] não foi possível escutar em ${HOST}:${PORT}: ${error.message}`);
    process.exit(1);
  }
  console.log(`[scheduler] painel em http://${HOST}:${PORT} (fuso ${TIME_ZONE}${paused ? ', pausado' : ''})`);
});
