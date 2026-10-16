// Agenda da nuvem: dispara workflows do GitHub Actions em horários cron.
// Os disparos passam por uma fila e saem um de cada vez: o próximo só vai
// quando a execução anterior do workflow terminou. Sem isso, o GitHub
// cancelaria execuções pendentes do mesmo grupo de concorrência.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import cron from 'node-cron';
import { findWorkflow, validateInputs, WORKFLOWS } from './github-actions.mjs';

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,40}$/;
const HISTORY_LIMIT = 100;
const WAIT_STEP_MS = 30_000;
const WAIT_LIMIT_MS = 2 * 60 * 60_000;

export function validateCloudJob(input) {
  const errors = [];
  const job = {
    id: String(input?.id ?? '').trim(),
    name: String(input?.name ?? '').trim(),
    cron: String(input?.cron ?? '').trim().replace(/\s+/g, ' '),
    enabled: input?.enabled === true,
    order: Number.isFinite(Number(input?.order)) ? Number(input.order) : 0,
    workflow: String(input?.workflow ?? ''),
    inputs: {},
  };
  if (!ID_PATTERN.test(job.id)) errors.push('id deve ter 2–41 caracteres: letras minúsculas, números e hífen');
  if (!job.name) errors.push('name é obrigatório');
  if (job.cron.split(' ').length !== 5 || !cron.validate(job.cron)) errors.push(`cron inválido: "${job.cron}" (use 5 campos, ex.: 0 */6 * * *)`);
  const workflow = findWorkflow(job.workflow);
  if (!workflow) errors.push(`workflow deve ser um de: ${WORKFLOWS.map((w) => w.file).join(', ')}`);
  else {
    const checked = validateInputs(workflow, input?.inputs);
    if (checked.error) errors.push(checked.error);
    else job.inputs = checked.inputs;
  }
  return errors.length ? { errors } : { job };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createCloudSchedule({
  file,
  historyFile,
  actions,
  timeZone,
  isPaused = () => false,
  schedule = cron.schedule,
  wait = sleep,
  log = console.log,
}) {
  const read = (target, fallback) => {
    try {
      return JSON.parse(fs.readFileSync(target, 'utf8'));
    } catch {
      return fallback;
    }
  };
  const write = (target, data) => {
    if (!target) return;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(`${target}.tmp`, `${JSON.stringify(data, null, 2)}\n`);
    fs.renameSync(`${target}.tmp`, target);
  };

  let jobs = read(file, { jobs: [] }).jobs;
  let history = historyFile ? read(historyFile, []) : [];
  const queue = [];
  const tasks = new Map();
  let draining = false;

  const sorted = () => [...jobs].sort((a, b) => a.order - b.order);
  const persist = () => write(file, { jobs: sorted() });

  function reschedule() {
    for (const task of tasks.values()) task.stop();
    tasks.clear();
    for (const job of jobs.filter((j) => j.enabled)) {
      tasks.set(job.id, schedule(job.cron, () => !isPaused() && enqueue(job.id, 'schedule'), { timezone: timeZone }));
    }
  }

  function record(entry) {
    history = [entry, ...history].slice(0, HISTORY_LIMIT);
    write(historyFile, history);
  }

  async function waitUntilIdle(workflow) {
    for (let waited = 0; waited < WAIT_LIMIT_MS; waited += WAIT_STEP_MS) {
      await wait(WAIT_STEP_MS);
      try {
        if (await actions.isIdle(workflow)) return;
      } catch (error) {
        log(`[nuvem] não consegui consultar ${workflow}: ${error.message}`);
      }
    }
  }

  async function drain() {
    if (draining) return;
    draining = true;
    try {
      while (queue.length) {
        const item = queue[0];
        const job = jobs.find((j) => j.id === item.jobId);
        if (job) {
          const entry = { id: randomUUID(), jobId: job.id, jobName: job.name, trigger: item.trigger, at: new Date().toISOString() };
          try {
            await actions.dispatch(job.workflow, job.inputs);
            record({ ...entry, status: 'dispatched' });
            log(`[nuvem] ${job.name} disparado`);
            await waitUntilIdle(job.workflow);
          } catch (error) {
            record({ ...entry, status: 'failed', error: error.message });
            log(`[nuvem] ${job.name} não disparou: ${error.message}`);
          }
        }
        queue.shift();
      }
    } finally {
      draining = false;
    }
  }

  function enqueue(jobId, trigger = 'manual') {
    if (!jobs.some((j) => j.id === jobId)) return { queued: false, reason: 'agendamento não encontrado' };
    if (queue.some((item) => item.jobId === jobId)) return { queued: false, reason: 'já está na fila' };
    queue.push({ id: randomUUID(), jobId, trigger, queuedAt: new Date().toISOString() });
    drain();
    return { queued: true, position: queue.length };
  }

  reschedule();

  return {
    state: () => ({ jobs: sorted(), queue: [...queue], history }),
    enqueue,
    drained: async () => {
      while (draining) await wait(5);
    },

    save(input, { create = false } = {}) {
      const { job, errors } = validateCloudJob(input);
      if (errors) return { errors };
      const exists = jobs.some((j) => j.id === job.id);
      if (create && exists) return { errors: [`já existe um agendamento com id "${job.id}"`] };
      if (!create && !exists) return { notFound: true };
      jobs = exists ? jobs.map((j) => (j.id === job.id ? job : j)) : [...jobs, job];
      persist();
      reschedule();
      return { job };
    },

    toggle(id) {
      const job = jobs.find((j) => j.id === id);
      if (!job) return null;
      job.enabled = !job.enabled;
      persist();
      reschedule();
      return job;
    },

    remove(id) {
      const before = jobs.length;
      jobs = jobs.filter((j) => j.id !== id);
      const index = queue.findIndex((item) => item.jobId === id);
      if (index > 0) queue.splice(index, 1);
      persist();
      reschedule();
      return jobs.length !== before;
    },

    /** Nova ordem a partir da lista completa de ids. */
    reorder(ids) {
      const current = sorted();
      if (ids.length !== current.length || !current.every((j) => ids.includes(j.id))) return false;
      jobs = current.map((j) => ({ ...j, order: (ids.indexOf(j.id) + 1) * 10 }));
      persist();
      return true;
    },

    stop() {
      for (const task of tasks.values()) task.stop();
    },
  };
}
