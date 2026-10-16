import { Fragment, useState } from 'react';
import { api, attempt, send } from '../lib/api';
import { ago, isScheduleLive, slug } from '../lib/format';
import { localEvidence } from '../lib/evidence';
import { ConfirmDialog, EvidenceViewer, Notice, PanelTitle, Pill, ScheduleBadge, SpecPicker, WindowFields } from '../components/ui';
import type { Catalog, JobView, Kind, ProductId, Status, Suites, Window } from '../types';

type Props = { product: ProductId; status?: Status; error: string; reload: () => Promise<void>; catalog?: Catalog; reloadCatalog: () => Promise<void> };

type Draft = {
  id: string;
  name: string;
  workspace: string;
  script: string;
  intervalMinutes: number;
  timeoutMinutes: number;
  triage: boolean;
  enabled: boolean;
  window: Window;
  specs: string[];
};

const WORKSPACE: Record<ProductId, string> = { mobile: 'mobile-e2e', web: 'web-e2e' };
const SUITE_OF_SCRIPT: Record<string, keyof Suites> = { 'suite:smoke': 'smoke', 'suite:regression': 'regression' };
const GROUPS: Array<[Kind, string]> = [
  ['suite', 'Suítes'],
  ['test', 'Testes'],
  ['health', 'Health checks'],
];

function emptyDraft(product: ProductId): Draft {
  return { id: '', name: '', workspace: WORKSPACE[product], script: '', intervalMinutes: 120, timeoutMinutes: 20, triage: true, enabled: false, window: { from: '08:00', to: '18:00' }, specs: [] };
}

function draftOf(job: JobView, catalog?: Catalog): Draft {
  const suite = SUITE_OF_SCRIPT[job.script];
  return { ...job, specs: suite && catalog?.suites ? catalog.suites[suite] : [] };
}

export function LocalTestsPanel({ product, status, error, reload, catalog, reloadCatalog }: Props) {
  const tests = (status?.tests ?? []).filter((t) => t.kind !== 'health');
  const queue = status?.queue ?? [];
  const existing = new Set((status?.tests ?? []).map((t) => t.id));
  const [editing, setEditing] = useState<Draft>();
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');
  const [message, setMessage] = useState('');
  const [pendingDelete, setPendingDelete] = useState<JobView>();
  const [viewer, setViewer] = useState<JobView>();
  const [bulk, setBulk] = useState<{ intervalMinutes: number; window: Window }>();

  async function act(action: () => Promise<unknown>) {
    setMessage(await attempt(action));
    await reload();
  }

  async function moveQueue(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= queue.length) return;
    const ids = queue.map((item) => item.jobId);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await act(() => send('POST', '/api/queue/reorder', { ids }));
  }

  function openNew() {
    setFormError('');
    setCreating(true);
    setEditing(emptyDraft(product));
  }

  function openEdit(job: JobView) {
    setFormError('');
    setCreating(false);
    setEditing(draftOf(job, catalog));
  }

  function close() {
    setEditing(undefined);
    setCreating(false);
    setFormError('');
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const draft = { ...editing, id: editing.id || `${product}-${slug(editing.name)}` };
    const error = await attempt(async () => {
      const suite = SUITE_OF_SCRIPT[draft.script];
      if (product === 'mobile' && suite) await send('PUT', '/api/suites/mobile', { [suite]: draft.specs });
      if (creating) await send('POST', '/api/jobs', draft);
      else await send('PUT', `/api/jobs/${draft.id}`, draft);
    });
    if (error) return setFormError(error);
    close();
    await Promise.all([reload(), reloadCatalog()]);
  }

  async function saveBulk(event: React.FormEvent) {
    event.preventDefault();
    if (!bulk) return;
    const minutes = Math.max(1, Number(bulk.intervalMinutes) || 30);
    await act(() => Promise.all(tests.map((t) => send('PUT', `/api/jobs/${t.id}`, { ...t, intervalMinutes: minutes, window: bulk.window }))));
    setBulk(undefined);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    await act(() => send('DELETE', `/api/jobs/${pendingDelete.id}`));
    if (editing?.id === pendingDelete.id) close();
    setPendingDelete(undefined);
  }

  const form = editing ? (
    <TestForm draft={editing} setDraft={setEditing} creating={creating} catalog={catalog} existing={existing} product={product} error={formError} onSubmit={save} onCancel={close} />
  ) : null;

  return (
    <section className="panel">
      <PanelTitle title="Testes (Local)">
        <button className="compact" onClick={openNew} disabled={creating}>
          Novo
        </button>
      </PanelTitle>
      {error ? <Notice>Agendador indisponível: {error}</Notice> : null}
      {message ? <Notice bad>{message}</Notice> : null}
      {queue.length ? (
        <div className="local-queue">
          <strong>Fila única (uma execução por vez):</strong>
          {queue.map((item, index) => (
            <span key={item.jobId}>
              {item.position}. {item.name}
              <small className="tag">{item.product === product ? (item.kind === 'health' ? 'health' : 'e2e') : item.product}</small>
              <button className="compact secondary" aria-label={`Subir ${item.name} na fila`} onClick={() => void moveQueue(index, -1)}>
                ↑
              </button>
              <button className="compact secondary" aria-label={`Descer ${item.name} na fila`} onClick={() => void moveQueue(index, 1)}>
                ↓
              </button>
              <button className="compact danger" aria-label={`Tirar ${item.name} da fila`} onClick={() => void act(() => send('DELETE', `/api/queue/${item.jobId}`))}>
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      {creating ? form : null}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Teste</th>
              <th>Agenda</th>
              <th>Status</th>
              <th>Última execução</th>
              <th>Fila</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {tests.map((t) => (
              <Fragment key={t.id}>
                <tr className={isScheduleLive(t.enabled, t.window) ? 'is-scheduled' : 'is-paused'}>
                  <td>
                    <strong>{t.name}</strong>
                    {t.kind === 'suite' && product === 'mobile' && catalog?.suites ? (
                      <div className="suite-specs">{suiteNames(t.script, catalog)}</div>
                    ) : null}
                    {t.replay ? (
                      <div className="meta">
                        Triagem · repetindo {t.replay.done + (t.status === 'running' ? 1 : 0)}/{t.replay.of}
                      </div>
                    ) : null}
                    <WhatItTests jobId={t.id} />
                  </td>
                  <td>
                    <ScheduleBadge enabled={t.enabled} minutes={t.intervalMinutes} window={t.window} nextRunAt={t.nextRunAt} />
                  </td>
                  <td>
                    <Pill status={t.status} />
                  </td>
                  <td>{t.lastRun ? ago(t.lastRun.finishedAt || t.lastRun.startedAt) : '—'}</td>
                  <td>{t.queuePosition ?? '—'}</td>
                  <td>
                    <div className="row-actions">
                      <button className="compact" disabled={t.status === 'running' || t.status === 'queued'} onClick={() => void act(() => send('POST', `/api/jobs/${t.id}/run`))}>
                        Executar
                      </button>
                      {t.status === 'running' ? (
                        <button className="danger compact" onClick={() => void act(() => send('POST', `/api/jobs/${t.id}/stop`))}>
                          Parar
                        </button>
                      ) : null}
                      <button className="secondary compact" onClick={() => openEdit(t)}>
                        Editar
                      </button>
                      <button className={`compact ${t.enabled ? 'pause' : 'activate'}`} onClick={() => void act(() => send('PATCH', `/api/jobs/${t.id}/enabled`, { enabled: !t.enabled }))}>
                        {t.enabled ? 'Pausar' : 'Ativar'}
                      </button>
                      <button className="secondary compact" disabled={!t.lastRun} onClick={() => setViewer(t)}>
                        Logs{t.lastRun?.video ? ' + vídeo' : ''}
                      </button>
                      <button className="danger compact" onClick={() => setPendingDelete(t)}>
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
                {!creating && editing?.id === t.id ? (
                  <tr className="edit-row">
                    <td colSpan={6}>{form}</td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
            {!tests.length ? (
              <tr>
                <td colSpan={6}>Nenhum teste local. Use “Novo” para escolher uma automação.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="list-edit">
        <button
          className="secondary compact"
          type="button"
          disabled={!tests.length || Boolean(bulk)}
          onClick={() => setBulk({ intervalMinutes: tests[0]?.intervalMinutes ?? 30, window: tests[0]?.window ?? null })}
        >
          Editar
        </button>
        {bulk ? (
          <form className="edit-form" onSubmit={(e) => void saveBulk(e)}>
            <h3>Editar agenda dos testes</h3>
            <label>
              Intervalo (min)
              <input type="number" min={1} required value={bulk.intervalMinutes} onChange={(e) => setBulk({ ...bulk, intervalMinutes: Number(e.target.value) })} />
            </label>
            <WindowFields value={bulk.window} onChange={(window) => setBulk({ ...bulk, window })} />
            <p className="form-hint">Vale para todos os {tests.length} testes desta lista.</p>
            <div className="row-actions">
              <button type="submit">Salvar</button>
              <button className="secondary" type="button" onClick={() => setBulk(undefined)}>
                Cancelar
              </button>
            </div>
          </form>
        ) : null}
      </div>
      {viewer?.lastRun ? (
        <EvidenceViewer
          title={`E2E · ${viewer.name}`}
          load={localEvidence({ runId: viewer.lastRun.runId, status: viewer.lastRun.status, kind: viewer.kind, video: viewer.lastRun.video })}
          close={() => setViewer(undefined)}
        />
      ) : null}
      {pendingDelete ? (
        <ConfirmDialog
          title="Excluir teste?"
          message={`Isso tira "${pendingDelete.name}" da lista e da agenda. O histórico antigo continua guardado.`}
          onCancel={() => setPendingDelete(undefined)}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}
    </section>
  );
}

function suiteNames(script: string, catalog: Catalog) {
  const suite = SUITE_OF_SCRIPT[script];
  if (!suite || !catalog.suites) return null;
  const names = new Map((catalog.specs ?? []).map((s) => [s.id, s.name]));
  return catalog.suites[suite].map((id) => names.get(id) ?? id).join(' · ');
}

type FormProps = {
  draft: Draft;
  setDraft: (draft: Draft) => void;
  creating: boolean;
  catalog?: Catalog;
  existing: Set<string>;
  product: ProductId;
  error: string;
  onSubmit: (event: React.FormEvent) => void;
  onCancel: () => void;
};

function TestForm({ draft, setDraft, creating, catalog, existing, product, error, onSubmit, onCancel }: FormProps) {
  const available = (catalog?.presets ?? []).filter((p) => !existing.has(p.id));
  const fromPreset = available.some((p) => p.id === draft.id);
  const scripts = (catalog?.scripts ?? []).filter((s) => !/^(health|appium|apk|prepare|doctor|typecheck|test:unit|browsers|report|ci:)/.test(s) && s !== 'test:ui' && s !== 'test:headed');
  const suite = SUITE_OF_SCRIPT[draft.script];

  function applyPreset(id: string) {
    const preset = available.find((p) => p.id === id);
    if (!preset) return setDraft(emptyDraft(product));
    setDraft({
      ...emptyDraft(product),
      ...preset,
      enabled: false,
      window: preset.kind === 'health' ? { from: '08:00', to: '18:00' } : draft.window,
      specs: SUITE_OF_SCRIPT[preset.script] && catalog?.suites ? catalog.suites[SUITE_OF_SCRIPT[preset.script]] : [],
    });
  }

  return (
    <form className="edit-form" onSubmit={onSubmit}>
      <h3>{creating ? 'Nova automação' : 'Editar automação'}</h3>
      {creating ? (
        <label className="preset-picker">
          Automação
          <select value={fromPreset ? draft.id : ''} onChange={(e) => applyPreset(e.target.value)}>
            <option value="">Personalizado</option>
            {GROUPS.map(([kind, label]) => {
              const items = available.filter((p) => p.kind === kind);
              return items.length ? (
                <optgroup key={kind} label={label}>
                  {items.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              ) : null;
            })}
          </select>
        </label>
      ) : null}
      <label>
        Nome
        <input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      </label>
      <label>
        Script
        <select required disabled={!creating || fromPreset} value={draft.script} onChange={(e) => setDraft({ ...draft, script: e.target.value })}>
          <option value="">Escolha…</option>
          {(scripts.includes(draft.script) || !draft.script ? scripts : [draft.script, ...scripts]).map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <label>
        Intervalo (min)
        <input type="number" min={1} required value={draft.intervalMinutes} onChange={(e) => setDraft({ ...draft, intervalMinutes: Number(e.target.value) })} />
      </label>
      <label>
        Tempo limite (min)
        <input type="number" min={1} max={180} required value={draft.timeoutMinutes} onChange={(e) => setDraft({ ...draft, timeoutMinutes: Number(e.target.value) })} />
      </label>
      <label className="check span-4">
        <input type="checkbox" checked={draft.triage} onChange={(e) => setDraft({ ...draft, triage: e.target.checked })} />
        Se falhar, repetir antes de avisar (triagem)
      </label>
      {product === 'mobile' && suite && catalog?.specs ? (
        <>
          <SpecPicker specs={catalog.specs} selected={draft.specs} onChange={(specs) => setDraft({ ...draft, specs })} />
          <p className="form-hint">A suíte também vale para a nuvem depois do commit e push do suites.json.</p>
        </>
      ) : null}
      {creating ? <p className="form-hint">Entra pausado: use “Ativar” na lista quando quiser que rode sozinho.</p> : null}
      {error ? <Notice bad>{error}</Notice> : null}
      <div className="row-actions">
        <button type="submit">Salvar</button>
        <button className="secondary" type="button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

type Feature = { feature: string; file: string; scenarios: Array<{ title: string }> };

/** "O que testa": as funcionalidades e cenários do job, lidos das specs ao abrir. */
function WhatItTests({ jobId }: { jobId: string }) {
  const [features, setFeatures] = useState<Feature[]>();
  const count = features?.reduce((n, f) => n + f.scenarios.length, 0);
  return (
    <details
      className="what"
      onToggle={(e) => {
        if ((e.target as HTMLDetailsElement).open && !features) void api<Feature[]>(`/api/jobs/${jobId}/catalog`).then(setFeatures, () => setFeatures([]));
      }}
    >
      <summary>O que testa{count !== undefined ? ` · ${count} cenário${count === 1 ? '' : 's'}` : ''}</summary>
      {features?.map((f) => (
        <div key={f.file} className="what-feature">
          <strong>{f.feature}</strong>
          <ul>
            {f.scenarios.map((s) => (
              <li key={s.title}>{s.title}</li>
            ))}
          </ul>
        </div>
      ))}
      {features && !features.length ? <p className="meta">Sem cenários encontrados.</p> : null}
    </details>
  );
}
