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
      el('td', { className: 'actions' }, el('button', { className: 'btn btn-ghost', onclick: () => openCatalog(job) }, 'O que testa'), action),
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

const VERDICT_TEXT = { bug: 'bug confirmado', flaky: 'falha passageira', environment: 'problema de ambiente' };
const VERDICT_STATUS = { bug: 'failed', flaky: 'running', environment: 'idle' };

async function renderTriage() {
  const { channels, active, verdicts } = await api('/api/triage');
  const enabled = [channels.github && 'GitHub Issues', channels.webhook && 'webhook'].filter(Boolean);
  $('#triage-channels').textContent = enabled.length ? `avisos: ${enabled.join(' e ')}` : 'avisos só no painel';

  const activeItems = active.map((session) =>
    el(
      'li',
      {},
      statusBadge('running'),
      el('span', {}, session.jobName),
      el('span', { className: 'muted' }, `repetindo · ${session.attempts.length}/${session.retries}`),
    ),
  );
  const verdictItems = verdicts.slice(0, 20).map((verdict) => {
    const issue = verdict.notification?.issue;
    return el(
      'li',
      {},
      el('span', { className: `status status-${VERDICT_STATUS[verdict.kind]}` }, VERDICT_TEXT[verdict.kind]),
      el('span', {}, verdict.jobName),
      el('span', { className: 'muted' }, `${fmtDate(verdict.decidedAt)} · ${verdict.attempts.length} repetição(ões) · ${verdict.signature}`),
      issue ? el('a', { className: 'btn btn-ghost', href: issue.url, target: '_blank', rel: 'noopener' }, `Issue #${issue.number}`) : '',
    );
  });
  const items = [...activeItems, ...verdictItems];
  $('#triage').replaceChildren(...(items.length ? items : [el('li', { className: 'empty' }, 'Nenhuma falha em triagem.')]));
}

async function openCatalog(job) {
  const features = await api(`/api/jobs/${job.id}/catalog`);
  const total = features.reduce((sum, f) => sum + f.scenarios.length, 0);
  $('#catalog-title').textContent = `${job.name} — ${total} cenário(s)`;
  $('#catalog-body').replaceChildren(
    ...(features.length
      ? features.map((feature) =>
          el(
            'section',
            {},
            el('h3', {}, feature.feature, el('span', { className: 'muted' }, ` · ${feature.file}`)),
            el('ul', {}, ...feature.scenarios.map((s) => el('li', {}, s.title))),
          ),
        )
      : [el('p', { className: 'muted' }, 'Não foi possível listar os cenários deste script.')]),
  );
  $('#catalog-dialog').showModal();
}

const CONFIG_STATUS = { missing: 'failed', partial: 'running' };
let configLoaded = false;

async function renderConfig() {
  if (configLoaded) return;
  const report = await api('/api/config');
  configLoaded = true;
  const pending = report.filter((item) => item.status !== 'ok' && item.kind !== 'default');
  $('#config-summary').textContent = pending.length ? `${pending.length} item(ns) desligado(s)` : 'tudo configurado';
  const items = pending.map((item) =>
    el(
      'li',
      {},
      el('span', { className: `status status-${CONFIG_STATUS[item.status]}` }, item.status === 'partial' ? 'incompleto' : 'ausente'),
      el('code', {}, item.names.join(item.anyOf ? ' ou ' : ' + ')),
      el('span', { className: 'muted' }, `${item.workspace} · ${item.impact}`),
    ),
  );
  $('#config').replaceChildren(
    ...(items.length ? items : [el('li', { className: 'empty' }, 'Nenhuma configuração pendente. Os valores nunca são exibidos.')]),
  );
}

const PREPARE_TEXT = {
  idle: 'Celular: não preparado nesta sessão (só prepara sozinho quando há job mobile ativo).',
  running: 'Celular: preparando — conferindo o APK e ligando o emulador se precisar…',
  ready: 'Celular: pronto (APK em dia e device online).',
  failed: 'Celular: a preparação falhou. Veja o log.',
};

async function renderPrepare() {
  const state = await api('/api/prepare');
  const status = $('#prepare-status');
  status.textContent = PREPARE_TEXT[state.status];
  status.title = state.output ? state.output.slice(-1500) : '';
  $('#prepare-btn').disabled = state.status === 'running';
}

async function openLog(runId) {
  const run = await api(`/api/history/${runId}`);
  $('#log-title').textContent = `${run.jobName} — ${run.status}`;
  $('#log-output').textContent = run.output || '(sem saída)';
  $('#log-dialog').showModal();
}

async function refresh() {
  const status = await api('/api/status');
  $('#subtitle').textContent = status.paused
    ? `Agenda pausada: nada roda sozinho até você retomar · fuso ${status.timeZone}`
    : `Fuso ${status.timeZone} · ${status.queue.length} na fila`;
  const pauseButton = $('#pause-toggle');
  pauseButton.textContent = status.paused ? 'Retomar agenda' : 'Pausar agenda';
  pauseButton.onclick = () => api('/api/pause', { method: 'POST', body: { paused: !status.paused } }).then(refresh);
  renderJobs(status);
  await Promise.all([renderConfig(), renderPrepare(), renderTriage(), renderHistory()]);
}

$('#log-close').addEventListener('click', () => $('#log-dialog').close());
$('#catalog-close').addEventListener('click', () => $('#catalog-dialog').close());
$('#prepare-btn').addEventListener('click', () => api('/api/prepare', { method: 'POST' }).then(refresh));
$('#clear-history').addEventListener('click', async () => {
  if (confirm('Apagar todo o histórico de execuções?')) {
    await api('/api/history', { method: 'DELETE' });
    refresh();
  }
});

refresh();
setInterval(refresh, REFRESH_MS);
