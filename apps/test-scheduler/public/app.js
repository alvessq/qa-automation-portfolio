const REFRESH_MS = 5000;
const $ = (selector) => document.querySelector(selector);

const api = async (path, options = {}) => {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (response.status === 204) return null;
  return response.json();
};

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const fmtDuration = (ms) => (ms == null ? '' : ms < 60_000 ? `${Math.round(ms / 1000)}s` : `${Math.round(ms / 60_000)} min`);
const fmtInterval = (min) => (min % 60 === 0 ? `${min / 60} h` : `${min} min`);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'className') node.className = value;
    else node.setAttribute(key, value);
  }
  for (const child of children.flat()) node.append(child ?? '');
  return node;
}

function statusBadge(status) {
  return el('span', { className: `status status-${status}` }, status);
}

function renderJobs(status) {
  const queued = new Set(status.queue.map((q) => q.jobId));
  const rows = status.jobs.map((job) => {
    const isRunning = status.running?.jobId === job.id;
    const state = isRunning ? 'running' : queued.has(job.id) ? 'queued' : null;

    const toggle = el('input', {
      type: 'checkbox',
      'aria-label': `Ativar ${job.name}`,
      onchange: async (event) => {
        await api(`/api/jobs/${job.id}/enabled`, { method: 'PATCH', body: { enabled: event.target.checked } });
        refresh();
      },
    });
    toggle.checked = job.enabled;

    const action = state
      ? el('button', { className: 'btn btn-ghost', onclick: () => api(`/api/jobs/${job.id}/stop`, { method: 'POST' }).then(refresh) }, 'Parar')
      : el('button', { className: 'btn', onclick: () => api(`/api/jobs/${job.id}/run`, { method: 'POST' }).then(refresh) }, 'Executar');

    const last = state
      ? statusBadge(state)
      : job.lastRun
        ? el('span', {}, statusBadge(job.lastRun.status), ` ${fmtDate(job.lastRun.startedAt)} ${fmtDuration(job.lastRun.durationMs)}`)
        : el('span', { className: 'muted' }, 'nunca');

    return el(
      'tr',
      {},
      el('td', {}, toggle),
      el('td', {}, job.name),
      el('td', {}, el('code', {}, `${job.workspace} › ${job.script}`)),
      el('td', {}, fmtInterval(job.intervalMinutes)),
      el('td', {}, job.window ? `${job.window.from}–${job.window.to}` : 'sempre'),
      el('td', {}, last),
      el('td', {}, fmtDate(job.nextRunAt)),
      el('td', {}, action),
    );
  });
  $('#jobs').replaceChildren(...rows);
}

async function renderHistory() {
  const history = await api('/api/history');
  if (!history.length) {
    $('#history').replaceChildren(el('li', { className: 'empty' }, 'Nenhuma execução ainda.'));
    return;
  }
  $('#history').replaceChildren(
    ...history.slice(0, 50).map((run) =>
      el(
        'li',
        {},
        statusBadge(run.status),
        el('span', {}, run.jobName),
        el('span', { className: 'muted' }, `${fmtDate(run.startedAt)} · ${run.trigger} · ${fmtDuration(run.durationMs)}`),
        el('button', { className: 'btn btn-ghost', onclick: () => openLog(run.runId) }, 'Log'),
      ),
    ),
  );
}

async function openLog(runId) {
  const run = await api(`/api/history/${runId}`);
  $('#log-title').textContent = `${run.jobName} — ${run.status}`;
  $('#log-output').textContent = run.output || '(sem saída)';
  $('#log-dialog').showModal();
}

async function refresh() {
  const status = await api('/api/status');
  $('#subtitle').textContent = `Fuso ${status.timeZone} · ${status.queue.length} na fila`;
  const pauseButton = $('#pause-toggle');
  pauseButton.textContent = status.paused ? 'Retomar agenda' : 'Pausar agenda';
  pauseButton.onclick = () => api('/api/pause', { method: 'POST', body: { paused: !status.paused } }).then(refresh);
  renderJobs(status);
  await renderHistory();
}

$('#log-close').addEventListener('click', () => $('#log-dialog').close());
$('#clear-history').addEventListener('click', async () => {
  if (confirm('Apagar todo o histórico de execuções?')) {
    await api('/api/history', { method: 'DELETE' });
    refresh();
  }
});

refresh();
setInterval(refresh, REFRESH_MS);
