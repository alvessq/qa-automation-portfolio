// Fila serial de execuções. Uma suíte por vez: o emulador Android e o site
// alvo não devem receber execuções concorrentes do mesmo agendador.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const OUTPUT_TAIL_CHARS = 20_000;

export function createRunner({ store, repoRoot, onChange = () => {}, onFinish = () => {} }) {
  const queue = [];
  let current = null;

  /** `front: true` fura a fila (usado pelas repetições da triagem). */
  function enqueue(job, trigger, { front = false } = {}) {
    if (current?.job.id === job.id || queue.some((item) => item.job.id === job.id)) {
      return { queued: false, reason: 'job já está em execução ou na fila' };
    }
    const item = { job, trigger, queuedAt: new Date().toISOString() };
    if (front) queue.unshift(item);
    else queue.push(item);
    onChange();
    setImmediate(next);
    return { queued: true, position: front ? 1 : queue.length };
  }

  function dequeue(jobId) {
    const index = queue.findIndex((item) => item.job.id === jobId);
    if (index === -1) return false;
    queue.splice(index, 1);
    onChange();
    return true;
  }

  /** Nova ordem da fila a partir da lista completa de ids (falha se a fila mudou nesse meio-tempo). */
  function reorder(ids) {
    const byId = new Map(queue.map((item) => [item.job.id, item]));
    if (ids.length !== queue.length || !ids.every((id) => byId.has(id))) return false;
    queue.splice(0, queue.length, ...ids.map((id) => byId.get(id)));
    onChange();
    return true;
  }

  function stop(jobId) {
    if (current?.job.id !== jobId) return false;
    current.stopRequested = true;
    killTree(current.child);
    return true;
  }

  function next() {
    if (current || !queue.length) return;
    const { job, trigger } = queue.shift();

    const run = {
      runId: randomUUID(),
      jobId: job.id,
      jobName: job.name,
      trigger,
      status: 'running',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      durationMs: null,
      exitCode: null,
      output: '',
    };
    store.saveRun(run);

    const child = spawnNpmScript(job.workspace, job.script, repoRoot);
    const execution = { job, run, child, stopRequested: false, timedOut: false };
    current = execution;
    onChange();

    const append = (chunk) => {
      run.output = (run.output + chunk.toString()).slice(-OUTPUT_TAIL_CHARS);
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);

    const timeout = setTimeout(() => {
      append(`\n[scheduler] timeout de ${job.timeoutMinutes} min atingido — encerrando.\n`);
      execution.timedOut = true;
      killTree(child);
    }, job.timeoutMinutes * 60_000);

    child.on('error', (error) => append(`\n[scheduler] falha ao iniciar: ${error.message}\n`));
    child.on('close', (code) => {
      clearTimeout(timeout);
      run.exitCode = code;
      run.status = execution.stopRequested ? 'stopped' : execution.timedOut ? 'timeout' : code === 0 ? 'passed' : 'failed';
      run.finishedAt = new Date().toISOString();
      run.durationMs = Date.parse(run.finishedAt) - Date.parse(run.startedAt);
      store.saveRun(run);
      current = null;
      onChange();
      onFinish(job, run);
      setImmediate(next);
    });
  }

  return {
    enqueue,
    dequeue,
    reorder,
    stop,
    state: () => ({
      running: current ? { jobId: current.job.id, runId: current.run.runId, startedAt: current.run.startedAt } : null,
      queue: queue.map(({ job, trigger, queuedAt }) => ({ jobId: job.id, trigger, queuedAt })),
    }),
    liveOutput: (runId) => (current?.run.runId === runId ? current.run.output : null),
  };
}

/**
 * `npm run <script> -w <workspace>` a partir da raiz do monorepo. Workspace e
 * script já foram validados contra os package.json (job-validation.mjs).
 */
export function spawnNpmScript(workspace, script, cwd) {
  const npmCli = process.env.npm_execpath;
  const args = ['run', script, '-w', workspace];
  const options = { cwd, env: { ...process.env, FORCE_COLOR: '0' }, detached: process.platform !== 'win32' };

  if (npmCli?.endsWith('.js')) return spawn(process.execPath, [npmCli, ...args], options);
  // Sem npm_execpath (servidor iniciado com `node` direto), o Windows exige shell para npm.cmd.
  if (process.platform === 'win32') return spawn(`npm ${args.join(' ')}`, { ...options, shell: true });
  return spawn('npm', args, options);
}

function killTree(child) {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
  }
}
