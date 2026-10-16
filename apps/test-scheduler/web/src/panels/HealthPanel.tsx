import { Fragment, useState } from 'react';
import { attempt, send } from '../lib/api';
import { ago, isScheduleLive } from '../lib/format';
import { localEvidence } from '../lib/evidence';
import { EvidenceViewer, Notice, PanelTitle, Pill, ScheduleBadge, WindowFields } from '../components/ui';
import type { JobView, Status, Window } from '../types';

type Props = { status?: Status; error: string; reload: () => Promise<void> };

/** Uma linha por conferência do health, cada uma com a própria agenda. */
export function HealthPanel({ status, error, reload }: Props) {
  const tests = (status?.tests ?? []).filter((t) => t.kind === 'health');
  const [viewer, setViewer] = useState<JobView>();
  const [editing, setEditing] = useState(false);
  const [timeWindow, setTimeWindow] = useState<Window>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [intervals, setIntervals] = useState<Record<string, number>>({});
  const [message, setMessage] = useState('');
  const failed = tests.filter((t) => ['failed', 'timeout'].includes(t.status)).length;

  async function act(action: () => Promise<unknown>) {
    setMessage(await attempt(action));
    await reload();
  }

  function openEdit() {
    setTimeWindow(tests[0]?.window ?? null);
    setNames(Object.fromEntries(tests.map((t) => [t.id, t.name])));
    setIntervals(Object.fromEntries(tests.map((t) => [t.id, t.intervalMinutes])));
    setEditing(true);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    await act(() =>
      Promise.all(
        tests.map((t) =>
          send('PUT', `/api/jobs/${t.id}`, { ...t, name: (names[t.id] || t.name).trim(), intervalMinutes: Math.max(1, Number(intervals[t.id]) || 5), window: timeWindow }),
        ),
      ),
    );
    setEditing(false);
  }

  return (
    <section className="panel">
      <PanelTitle title="Health dos serviços">
        <span className="meta">
          {failed} falha{failed === 1 ? '' : 's'}
        </span>
      </PanelTitle>
      {error ? <Notice>Agendador indisponível: {error}</Notice> : null}
      {message ? <Notice bad>{message}</Notice> : null}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Serviço</th>
              <th>Agenda</th>
              <th>Status</th>
              <th>Última execução</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {tests.map((t) => (
              <tr key={t.id} className={isScheduleLive(t.enabled, t.window) ? 'is-scheduled' : 'is-paused'}>
                <td>
                  <strong>{t.name}</strong>
                  {t.hint ? <div className="meta">{t.hint}</div> : null}
                </td>
                <td>
                  <ScheduleBadge enabled={t.enabled} minutes={t.intervalMinutes} window={t.window} nextRunAt={t.nextRunAt} />
                </td>
                <td>
                  <Pill status={t.status} />
                </td>
                <td>{t.lastRun ? ago(t.lastRun.finishedAt || t.lastRun.startedAt) : '—'}</td>
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
                    <button className={`compact ${t.enabled ? 'pause' : 'activate'}`} onClick={() => void act(() => send('PATCH', `/api/jobs/${t.id}/enabled`, { enabled: !t.enabled }))}>
                      {t.enabled ? 'Pausar' : 'Ativar'}
                    </button>
                    <button className="secondary compact" disabled={!t.lastRun} onClick={() => setViewer(t)}>
                      Logs
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!tests.length ? (
              <tr>
                <td colSpan={5}>Nenhum health check na configuração.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="list-edit">
        <button className="secondary compact" type="button" onClick={openEdit} disabled={!tests.length || editing}>
          Editar
        </button>
        {editing ? (
          <form className="edit-form" onSubmit={(e) => void save(e)}>
            <h3>Editar health checks</h3>
            <WindowFields value={timeWindow} onChange={setTimeWindow} />
            {tests.map((t) => (
              <Fragment key={t.id}>
                <label className="span-2">
                  {t.hint ?? t.name}
                  <input required value={names[t.id] ?? ''} onChange={(e) => setNames({ ...names, [t.id]: e.target.value })} />
                </label>
                <label className="span-2">
                  Intervalo (min)
                  <input type="number" min={1} required value={intervals[t.id] ?? ''} onChange={(e) => setIntervals({ ...intervals, [t.id]: Number(e.target.value) })} />
                </label>
              </Fragment>
            ))}
            <div className="row-actions">
              <button type="submit">Salvar</button>
              <button className="secondary" type="button" onClick={() => setEditing(false)}>
                Cancelar
              </button>
            </div>
          </form>
        ) : null}
      </div>
      {viewer?.lastRun ? (
        <EvidenceViewer
          title={`Health · ${viewer.name}`}
          load={localEvidence({ runId: viewer.lastRun.runId, status: viewer.lastRun.status, kind: 'health' })}
          close={() => setViewer(undefined)}
        />
      ) : null}
    </section>
  );
}
