import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import cron from 'node-cron';
import { isDue, nextRunAt } from './schedule-window.mjs';
import { loadAvailableScripts, validateJob } from './job-validation.mjs';
import { createStore } from './store.mjs';
import { createRunner, spawnNpmScript } from './runner.mjs';
import { createPreparer, shouldPrepare } from './prepare.mjs';
import { createGithubActions } from './github-actions.mjs';
import { createCloudSchedule } from './cloud-schedule.mjs';
import { createTriage, DEFAULT_RETRIES } from './triage.mjs';
import { createNotifier } from './notifier.mjs';
import { catalogFor } from './test-catalog.mjs';
import { diagnose, effectiveEnv, summarize } from './env-doctor.mjs';
import { basicAuth, exposureError, startPaused } from './safety.mjs';
import { healthHint, kindOf, mobileSpecs, presetsFor, productOfWorkspace, PRODUCTS, readSuites, writeSuites } from './automations.mjs';
import { createVideos } from './videos.mjs';
import { createDeviceStatus } from './device.mjs';

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(APP_DIR, '..', '..');
const DATA_DIR = path.join(APP_DIR, 'data');
const DIST_DIR = path.join(APP_DIR, 'dist');
dotenv.config({ path: path.join(APP_DIR, '.env'), quiet: true });

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT) || 7400;
const TIME_ZONE = process.env.SCHEDULER_TZ || 'America/Sao_Paulo';
const APPS_DIR = path.join(REPO_ROOT, 'apps');
const PANEL_LOGIN = { user: process.env.PANEL_USER, password: process.env.PANEL_PASSWORD };
const REPOSITORY = process.env.GITHUB_REPOSITORY;

const exposure = exposureError(HOST, PANEL_LOGIN);
if (exposure) {
  console.error(`[scheduler] ${exposure}`);
  process.exit(1);
}

const configReport = diagnose(effectiveEnv(APPS_DIR));
for (const line of summarize(configReport)) console.log(line);

const store = createStore({
  configFile: path.join(APP_DIR, 'config.json'),
  historyFile: path.join(DATA_DIR, 'history.json'),
  historyLimit: Number(process.env.HISTORY_LIMIT) || 500,
  verdictsFile: path.join(DATA_DIR, 'triage.json'),
});
const availableScripts = loadAvailableScripts(APPS_DIR);
const videos = createVideos({ dir: path.join(DATA_DIR, 'videos'), appsDir: APPS_DIR });
const deviceStatus = createDeviceStatus();

const triage = createTriage({ retries: Number(process.env.TRIAGE_RETRIES ?? DEFAULT_RETRIES) });
const notifier = createNotifier({ repository: REPOSITORY, token: process.env.GITHUB_TOKEN, webhookUrl: process.env.TRIAGE_WEBHOOK_URL });

const runner = createRunner({
  store,
  repoRoot: REPO_ROOT,
  onFinish(job, run) {
    if (kindOf(job) !== 'health') {
      run.video = videos.collect(job, run);
      store.saveRun(run);
    }
    const step = triage.handle(job, run);
    if (step.action === 'retry') {
      console.log(`[triagem] ${job.name}: repetição ${step.attempt}`);
      runner.enqueue(job, 'triagem', { front: true });
    } else if (step.action === 'verdict') {
      const origin = store.listHistory().find((r) => r.runId === step.verdict.origin.runId);
      const verdict = { ...step.verdict, product: productOfWorkspace(job.workspace), video: run.video ?? origin?.video ?? null };
      store.saveVerdict({ ...verdict, notification: { pending: true } });
      console.log(`[triagem] ${job.name}: ${verdict.kind}`);
      notifier.notify(verdict, run.output).then((notification) => store.saveVerdict({ ...verdict, notification }));
    }
  },
});

// Pausado ao abrir (uso local): nem a agenda local nem a da nuvem disparam nada.
let paused = startPaused(process.env);

const actions = createGithubActions({ repository: REPOSITORY, token: process.env.GITHUB_TOKEN, mediaDir: path.join(DATA_DIR, 'cloud-media') });
const cloud = createCloudSchedule({
  file: path.join(APP_DIR, 'cloud-schedule.json'),
  historyFile: path.join(DATA_DIR, 'cloud-history.json'),
  actions,
  timeZone: TIME_ZONE,
  isPaused: () => paused,
});

const preparer = createPreparer({ spawnScript: (workspace, script) => spawnNpmScript(workspace, script, REPO_ROOT) });
if (shouldPrepare(process.env, store.listJobs())) {
  console.log('[preparo] conferindo APK e emulador em segundo plano…');
  preparer.start();
}

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

/** Job como o painel mostra: status atual, fila, última execução, próxima e triagem em andamento. */
function jobViews() {
  const now = new Date();
  const { running, queue } = runner.state();
  const lastRun = new Map();
  for (const run of store.listHistory()) if (!lastRun.has(run.jobId)) lastRun.set(run.jobId, run);
  const sessions = new Map(triage.active().map((s) => [s.jobId, s]));
  return store.listJobs().map((job) => {
    const last = lastRun.get(job.id);
    const position = queue.findIndex((item) => item.jobId === job.id);
    const session = sessions.get(job.id);
    const kind = kindOf(job);
    let status = last?.status ?? 'idle';
    if (running?.jobId === job.id) status = 'running';
    else if (position > -1) status = 'queued';
    return {
      ...job,
      product: productOfWorkspace(job.workspace),
      kind,
      hint: kind === 'health' ? healthHint(job) : null,
      status,
      queuePosition: position > -1 ? position + 1 : null,
      lastRun: last
        ? { runId: last.runId, status: last.status, trigger: last.trigger, startedAt: last.startedAt, finishedAt: last.finishedAt, durationMs: last.durationMs, video: last.video ?? null }
        : null,
      nextRunAt: paused ? null : nextRunAt(job, last?.startedAt, now, TIME_ZONE),
      // Triagem em andamento: "reproduzindo 2/3".
      replay: session ? { done: session.attempts.length, of: session.retries } : null,
    };
  });
}

const productParam = (req) => (PRODUCTS[req.query.product] ? req.query.product : null);
const jobProduct = (jobId) => productOfWorkspace(store.getJob(jobId)?.workspace);

const app = express();
app.use(basicAuth(PANEL_LOGIN));
app.use(express.json({ limit: '32kb' }));

app.get('/api/overview', (_req, res) => {
  const views = jobViews();
  const products = Object.values(PRODUCTS).map(({ id, name }) => {
    const tests = views.filter((v) => v.product === id);
    const passed = tests.filter((t) => t.lastRun?.status === 'passed').length;
    const failed = tests.filter((t) => ['failed', 'timeout'].includes(t.lastRun?.status)).length;
    const running = tests.filter((t) => t.status === 'running').length;
    const generatedAt = tests.map((t) => t.lastRun?.finishedAt).filter(Boolean).sort().at(-1) ?? null;
    return {
      id,
      name,
      status: running ? 'running' : failed ? 'failed' : passed ? 'passed' : 'idle',
      summary: { total: tests.length, passed, failed },
      running,
      generatedAt,
    };
  });
  res.json({ paused, timeZone: TIME_ZONE, github: actions.configured, config: configReport, products });
});

app.get('/api/status', (req, res) => {
  const product = productParam(req);
  const views = jobViews();
  const names = new Map(views.map((v) => [v.id, v]));
  const { queue } = runner.state();
  res.json({
    serverTime: new Date().toISOString(),
    paused,
    tests: product ? views.filter((v) => v.product === product) : views,
    // Fila única para os dois produtos: o painel mostra tudo o que vem antes.
    queue: queue.map((item, index) => ({
      ...item,
      position: index + 1,
      name: names.get(item.jobId)?.name ?? item.jobId,
      kind: names.get(item.jobId)?.kind ?? 'test',
      product: names.get(item.jobId)?.product ?? null,
    })),
    emulator: product === 'mobile' ? deviceStatus() : undefined,
    prepare: product === 'mobile' ? preparer.state() : undefined,
  });
});

app.get('/api/catalog', (req, res) => {
  const product = productParam(req);
  if (!product) return res.status(400).json({ error: 'product deve ser mobile ou web' });
  res.json({
    presets: presetsFor(product, APPS_DIR, availableScripts),
    scripts: availableScripts[PRODUCTS[product].workspace] ?? [],
    ...(product === 'mobile' ? { specs: mobileSpecs(APPS_DIR), suites: readSuites(APPS_DIR) } : {}),
  });
});

app.put('/api/suites/mobile', (req, res) => {
  const result = writeSuites(APPS_DIR, req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result.suites);
});

app.get('/api/config', (_req, res) => res.json(configReport));

app.get('/api/prepare', (_req, res) => res.json(preparer.state()));

app.post('/api/prepare', (_req, res) => {
  const started = preparer.start();
  res.status(started ? 202 : 409).json(preparer.state());
});

app.post('/api/pause', (req, res) => {
  paused = req.body?.paused !== false;
  res.json({ paused });
});

app.get('/api/jobs/:id/catalog', (req, res) => {
  const job = store.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'job não encontrado' });
  res.json(catalogFor(job, APPS_DIR));
});

app.post('/api/jobs', (req, res) => {
  const { job, errors } = validateJob(req.body, availableScripts);
  if (errors) return res.status(400).json({ error: errors.join('; ') });
  if (store.getJob(job.id)) return res.status(409).json({ error: `já existe um teste com id "${job.id}"` });
  res.status(201).json(store.saveJob(job));
});

app.put('/api/jobs/:id', (req, res) => {
  if (!store.getJob(req.params.id)) return res.status(404).json({ error: 'job não encontrado' });
  const { job, errors } = validateJob({ ...req.body, id: req.params.id }, availableScripts);
  if (errors) return res.status(400).json({ error: errors.join('; ') });
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

app.post('/api/jobs/:id/run', (req, res) => {
  const job = store.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'job não encontrado' });
  const result = runner.enqueue(job, 'manual');
  res.status(result.queued ? 202 : 409).json(result.queued ? result : { error: result.reason });
});

app.post('/api/jobs/:id/stop', (req, res) => {
  triage.cancel(req.params.id);
  const stopped = runner.stop(req.params.id) || runner.dequeue(req.params.id);
  res.status(stopped ? 200 : 409).json(stopped ? { stopped } : { error: 'o teste não está rodando nem na fila' });
});

app.post('/api/queue/reorder', (req, res) => {
  const ok = Array.isArray(req.body?.ids) && runner.reorder(req.body.ids.map(String));
  res.status(ok ? 200 : 409).json(ok ? runner.state() : { error: 'a fila mudou; atualize e tente de novo' });
});

app.delete('/api/queue/:jobId', (req, res) => {
  triage.cancel(req.params.jobId);
  res.status(runner.dequeue(req.params.jobId) ? 204 : 404).end();
});

app.get('/api/history', (req, res) => {
  const product = productParam(req);
  const runs = store.listHistory().map(({ output: _output, ...run }) => {
    const job = store.getJob(run.jobId);
    return { ...run, product: job ? productOfWorkspace(job.workspace) : null, kind: job ? kindOf(job) : 'test' };
  });
  res.json(product ? runs.filter((r) => r.product === product) : runs);
});

app.get('/api/history/:runId', (req, res) => {
  const run = store.listHistory().find((r) => r.runId === req.params.runId);
  if (!run) return res.status(404).json({ error: 'execução não encontrada' });
  res.json({ ...run, output: runner.liveOutput(run.runId) ?? run.output });
});

app.delete('/api/history', (req, res) => {
  const product = productParam(req);
  const jobIds = product ? store.listJobs().filter((j) => productOfWorkspace(j.workspace) === product).map((j) => j.id) : null;
  store.clearHistory(jobIds ? (run) => !jobIds.includes(run.jobId) : undefined);
  if (req.query.videos === '1') videos.clear(jobIds);
  res.status(204).end();
});

app.get('/api/videos', (req, res) => {
  const product = productParam(req);
  res.json(product ? videos.list().filter((v) => jobProduct(v.jobId) === product) : videos.list());
});

app.get('/api/videos/:name', (req, res) => {
  const file = videos.pathOf(req.params.name);
  if (!file) return res.status(404).json({ error: 'vídeo não encontrado (só ficam os 3 mais recentes de cada teste)' });
  res.sendFile(file);
});

app.get('/api/triage', (req, res) => {
  const product = productParam(req);
  const sessions = triage
    .active()
    .filter((s) => !product || jobProduct(s.jobId) === product)
    .map((s) => ({ jobId: s.jobId, jobName: s.jobName, done: s.attempts.length, of: s.retries, startedAt: s.startedAt }));
  const verdicts = store.listVerdicts().filter((v) => !product || (v.product ?? jobProduct(v.jobId)) === product);
  res.json({
    connection: {
      ...notifier.channels,
      repository: REPOSITORY ?? null,
      issuesUrl: REPOSITORY ? `https://github.com/${REPOSITORY}/issues?q=label%3Atriagem` : null,
    },
    retries: Number(process.env.TRIAGE_RETRIES ?? DEFAULT_RETRIES),
    emulator: product === 'mobile' ? deviceStatus() : undefined,
    sessions,
    verdicts,
  });
});

// Nuvem: execuções, disparo, cancelamento e evidências do GitHub Actions.
app.get('/api/cloud/runs', async (req, res) => {
  try {
    res.json({ configured: actions.configured, runs: await actions.runs(String(req.query.workflow || 'mobile-e2e.yml')) });
  } catch (error) {
    res.json({ configured: actions.configured, runs: [], error: error.message });
  }
});

app.post('/api/cloud/dispatch', async (req, res) => {
  try {
    res.status(202).json(await actions.dispatch(String(req.body?.workflow ?? ''), req.body?.inputs));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/cloud/sync', (_req, res) => {
  actions.sync();
  res.status(204).end();
});

app.post('/api/cloud/runs/:id/cancel', async (req, res) => {
  try {
    await actions.cancel(req.params.id);
    res.status(202).end();
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/cloud/runs/:id/logs', async (req, res) => {
  try {
    res.type('text/plain').send(await actions.logs(req.params.id));
  } catch (error) {
    res.status(400).type('text/plain').send(`Logs indisponíveis: ${error.message}`);
  }
});

app.get('/api/cloud/runs/:id/media', async (req, res) => {
  try {
    res.json(await actions.media(req.params.id));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/cloud/runs/:id/media/:name', (req, res) => {
  const file = actions.mediaPath(req.params.id, req.params.name);
  if (!file) return res.status(404).json({ error: 'arquivo não encontrado' });
  res.sendFile(file);
});

app.get('/api/cloud/schedule', (_req, res) => {
  res.json({ configured: actions.configured, paused, timeZone: TIME_ZONE, ...cloud.state() });
});

app.post('/api/cloud/schedule', (req, res) => {
  const result = cloud.save(req.body, { create: true });
  if (result.errors) return res.status(400).json({ error: result.errors.join('; ') });
  res.status(201).json(result.job);
});

app.put('/api/cloud/schedule/:id', (req, res) => {
  const result = cloud.save({ ...req.body, id: req.params.id });
  if (result.notFound) return res.status(404).json({ error: 'agendamento não encontrado' });
  if (result.errors) return res.status(400).json({ error: result.errors.join('; ') });
  res.json(result.job);
});

app.post('/api/cloud/schedule/:id/toggle', (req, res) => {
  const job = cloud.toggle(req.params.id);
  res.status(job ? 200 : 404).json(job ?? { error: 'agendamento não encontrado' });
});

app.post('/api/cloud/schedule/:id/run', (req, res) => {
  const result = cloud.enqueue(req.params.id, 'manual');
  res.status(result.queued ? 202 : 409).json(result.queued ? result : { error: result.reason });
});

app.delete('/api/cloud/schedule/:id', (req, res) => {
  res.status(cloud.remove(req.params.id) ? 204 : 404).end();
});

app.post('/api/cloud/reorder', (req, res) => {
  const ok = Array.isArray(req.body?.ids) && cloud.reorder(req.body.ids.map(String));
  res.status(ok ? 200 : 409).json(ok ? cloud.state() : { error: 'a agenda mudou; atualize e tente de novo' });
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'rota não encontrada' }));

// Painel (React, gerado por `npm run build` em dist/). As rotas do painel caem no index.html.
app.use(express.static(DIST_DIR));
app.get(['/', '/mobile', '/web'], (_req, res) => {
  const index = path.join(DIST_DIR, 'index.html');
  if (fs.existsSync(index)) return res.sendFile(index);
  res.status(503).type('text/plain').send('Painel ainda não gerado: rode `npm run build -w test-scheduler`.');
});

app.use((error, _req, res, _next) => {
  console.error(`[scheduler] ${error.stack ?? error}`);
  res.status(500).json({ error: error.message });
});

// No Express 5 o callback do listen recebe o erro (ex.: porta ocupada).
app.listen(PORT, HOST, (error) => {
  if (error) {
    console.error(`[scheduler] não foi possível escutar em ${HOST}:${PORT}: ${error.message}`);
    process.exit(1);
  }
  console.log(`[scheduler] painel em http://${HOST}:${PORT} (fuso ${TIME_ZONE}${paused ? ', pausado' : ''})`);
});
