import { Fragment, useState } from 'react';
import { attempt, send } from '../lib/api';
import { describeCron } from '../lib/cron';
import { slug } from '../lib/format';
import { ScheduleWhenEditor } from '../components/ScheduleWhenEditor';
import { ConfirmDialog, LivePill, Notice, PanelTitle } from '../components/ui';
import { cloudTests, targetOfInputs, WORKFLOW } from './cloud';
import type { Catalog, CloudJob, CloudSchedule } from '../types';

type Props = { schedule?: CloudSchedule; catalog?: Catalog; error: string; reload: () => Promise<void> };

type Draft = { id: string; name: string; cron: string; target: string };

/** Agenda da nuvem: horários que disparam o workflow, um de cada vez, na ordem da lista. */
export function CloudSchedulePanel({ schedule, catalog, error, reload }: Props) {
  const tests = cloudTests(catalog);
  const jobs = schedule?.jobs ?? [];
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState<Draft>();
  const [creating, setCreating] = useState<Draft>({ id: '', name: '', cron: '0 */6 * * *', target: 'smoke' });
  const [pendingDelete, setPendingDelete] = useState<CloudJob>();

  const inputsOf = (target: string) => tests.find((t) => t.target === target)?.inputs ?? { suite: 'smoke' };
  const titleOf = (job: CloudJob) => tests.find((t) => t.target === targetOfInputs(job.inputs))?.title ?? targetOfInputs(job.inputs);

  async function act(action: () => Promise<unknown>) {
    setMessage(await attempt(action));
    await reload();
  }

  async function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= jobs.length) return;
    const ids = jobs.map((j) => j.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await act(() => send('POST', '/api/cloud/reorder', { ids }));
  }

  async function saveEdit(event: React.FormEvent, job: CloudJob) {
    event.preventDefault();
    if (!editing) return;
    await act(() => send('PUT', `/api/cloud/schedule/${job.id}`, { ...job, name: editing.name, cron: editing.cron, inputs: inputsOf(editing.target) }));
    setEditing(undefined);
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const name = creating.name.trim() || tests.find((t) => t.target === creating.target)?.title || 'Agendamento';
    const id = `nuvem-${slug(name)}`;
    const order = (jobs.at(-1)?.order ?? 0) + 10;
    const error = await attempt(() => send('POST', '/api/cloud/schedule', { id, name, cron: creating.cron, enabled: false, order, workflow: WORKFLOW, inputs: inputsOf(creating.target) }));
    setMessage(error);
    if (!error) setCreating({ ...creating, name: '' });
    await reload();
  }

  const history = schedule?.history ?? [];
  const lastFailure = history.find((h) => h.status === 'failed');

  return (
    <section className="panel">
      <PanelTitle title="Agenda">
        <span className="meta">
          {schedule?.configured.dispatch ? `Dispara o workflow no GitHub (horário de ${schedule.timeZone})` : 'Defina GITHUB_TOKEN para a agenda disparar'}
        </span>
      </PanelTitle>
      {error ? <Notice bad>{error}</Notice> : null}
      {message ? <Notice bad>{message}</Notice> : null}
      {schedule?.paused ? <Notice>A agenda começa pausada no uso local: retome em “Retomar agenda”, no topo, para os horários valerem.</Notice> : null}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Quando</th>
              <th>Status</th>
              <th>Teste</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job, index) => (
              <Fragment key={job.id}>
                <tr className={job.enabled ? 'is-scheduled' : 'is-paused'}>
                  <td>
                    <strong>{job.name}</strong>
                  </td>
                  <td>{describeCron(job.cron)}</td>
                  <td>
                    <LivePill live={job.enabled} />
                  </td>
                  <td>{titleOf(job)}</td>
                  <td>
                    <div className="row-actions">
                      <button className="compact" disabled={!schedule?.configured.dispatch} onClick={() => void act(() => send('POST', `/api/cloud/schedule/${job.id}/run`))}>
                        Executar
                      </button>
                      <button className={`compact ${job.enabled ? 'pause' : 'activate'}`} onClick={() => void act(() => send('POST', `/api/cloud/schedule/${job.id}/toggle`))}>
                        {job.enabled ? 'Pausar' : 'Ativar'}
                      </button>
                      <button className="secondary compact" onClick={() => setEditing({ id: job.id, name: job.name, cron: job.cron, target: targetOfInputs(job.inputs) })}>
                        Editar
                      </button>
                      <button className="compact secondary" aria-label={`Subir ${job.name}`} onClick={() => void move(index, -1)}>
                        ↑
                      </button>
                      <button className="compact secondary" aria-label={`Descer ${job.name}`} onClick={() => void move(index, 1)}>
                        ↓
                      </button>
                      <button className="danger compact" onClick={() => setPendingDelete(job)}>
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
                {editing?.id === job.id ? (
                  <tr className="edit-row">
                    <td colSpan={5}>
                      <form className="schedule-form" onSubmit={(e) => void saveEdit(e, job)}>
                        <input aria-label="Nome" required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                        <TestSelect value={editing.target} onChange={(target) => setEditing({ ...editing, target })} tests={tests} />
                        <ScheduleWhenEditor value={editing.cron} onChange={(cron) => setEditing({ ...editing, cron })} />
                        <button type="submit">Salvar</button>
                        <button className="secondary" type="button" onClick={() => setEditing(undefined)}>
                          Cancelar
                        </button>
                      </form>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
            {!jobs.length ? (
              <tr>
                <td colSpan={5}>Nenhum agendamento na nuvem.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <form className="schedule-form create-schedule" onSubmit={(e) => void create(e)}>
        <strong>Novo agendamento</strong>
        <input aria-label="Nome do agendamento" placeholder="Nome (opcional)" value={creating.name} onChange={(e) => setCreating({ ...creating, name: e.target.value })} />
        <TestSelect value={creating.target} onChange={(target) => setCreating({ ...creating, target })} tests={tests} />
        <ScheduleWhenEditor value={creating.cron} onChange={(cron) => setCreating({ ...creating, cron })} />
        <button type="submit">Agendar</button>
      </form>
      <div className="queue-summary">
        Fila: {(schedule?.queue ?? []).map((item) => jobs.find((j) => j.id === item.jobId)?.name ?? item.jobId).join(' → ') || 'vazia'} · Disparos: {history.length}
        {lastFailure ? ` · último erro: ${lastFailure.error}` : ''}
      </div>
      {pendingDelete ? (
        <ConfirmDialog
          title="Excluir agendamento?"
          message={`"${pendingDelete.name}" deixa de disparar na nuvem. As execuções que já rodaram continuam no GitHub.`}
          onCancel={() => setPendingDelete(undefined)}
          onConfirm={() => {
            const job = pendingDelete;
            setPendingDelete(undefined);
            void act(() => send('DELETE', `/api/cloud/schedule/${job.id}`));
          }}
        />
      ) : null}
    </section>
  );
}

function TestSelect({ value, onChange, tests }: { value: string; onChange: (value: string) => void; tests: ReturnType<typeof cloudTests> }) {
  return (
    <select aria-label="Teste" value={value} onChange={(e) => onChange(e.target.value)}>
      <optgroup label="Suítes">
        {tests
          .filter((t) => !t.target.startsWith('spec:'))
          .map((t) => (
            <option key={t.target} value={t.target}>
              {t.title}
            </option>
          ))}
      </optgroup>
      <optgroup label="Testes">
        {tests
          .filter((t) => t.target.startsWith('spec:'))
          .map((t) => (
            <option key={t.target} value={t.target}>
              {t.title}
            </option>
          ))}
      </optgroup>
    </select>
  );
}
