import { Fragment, useState } from 'react';
import { attempt, send } from '../lib/api';
import { ago } from '../lib/format';
import { describeCron } from '../lib/cron';
import { cloudEvidence } from '../lib/evidence';
import { EvidenceViewer, LivePill, Notice, PanelTitle, Pill, SpecPicker } from '../components/ui';
import { cloudTests, runActive, runStatus, targetOfInputs, WORKFLOW, type CloudTest } from './cloud';
import type { Catalog, CloudRun, CloudRuns, CloudSchedule, Suites } from '../types';

type Props = {
  runs?: CloudRuns;
  schedule?: CloudSchedule;
  catalog?: Catalog;
  reload: () => Promise<void>;
  reloadCatalog: () => Promise<void>;
};

export function CloudTestsPanel({ runs, schedule, catalog, reload, reloadCatalog }: Props) {
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState<{ text: string; ok: boolean }>();
  const [viewer, setViewer] = useState<CloudRun>();
  const [suite, setSuite] = useState<{ name: keyof Suites; specs: string[]; error: string }>();
  const configured = runs?.configured ?? schedule?.configured;
  const jobs = schedule?.jobs ?? [];
  const queue = schedule?.queue ?? [];

  async function dispatch(test: CloudTest) {
    setBusy(test.target);
    const error = await attempt(() => send('POST', '/api/cloud/dispatch', { workflow: WORKFLOW, inputs: test.inputs }));
    setMessage(error ? { text: error, ok: false } : { text: `Execução enviada ao GitHub: ${test.title}. Ela aparece aqui em alguns segundos.`, ok: true });
    setBusy('');
    await reload();
  }

  async function act(action: () => Promise<unknown>) {
    const error = await attempt(action);
    if (error) setMessage({ text: error, ok: false });
    await reload();
  }

  async function saveSuite(event: React.FormEvent) {
    event.preventDefault();
    if (!suite) return;
    const error = await attempt(() => send('PUT', '/api/suites/mobile', { [suite.name]: suite.specs }));
    if (error) return setSuite({ ...suite, error });
    setSuite(undefined);
    await reloadCatalog();
  }

  return (
    <section className="panel">
      <PanelTitle title="Testes (GitHub)">
        <button className="secondary compact" onClick={() => void act(() => send('POST', '/api/cloud/sync'))}>
          Sincronizar
        </button>
        <button className="secondary compact" onClick={() => void reload()}>
          Atualizar
        </button>
      </PanelTitle>
      {!configured?.read ? (
        <Notice>
          Defina <code>GITHUB_REPOSITORY</code> no .env do agendador para ver as execuções, e <code>GITHUB_TOKEN</code> (Actions: read and write) para disparar.
        </Notice>
      ) : !configured.dispatch ? (
        <Notice>
          Só leitura: defina <code>GITHUB_TOKEN</code> (Actions: read and write) para disparar, cancelar e ver logs e evidências.
        </Notice>
      ) : null}
      {runs?.error ? <Notice bad>{runs.error}</Notice> : null}
      {message ? <Notice bad={!message.ok}>{message.text}</Notice> : null}
      {queue.length ? (
        <div className="local-queue">
          <strong>Fila de disparos:</strong>
          {queue.map((item, index) => (
            <span key={item.id}>
              {index + 1}. {jobs.find((j) => j.id === item.jobId)?.name ?? item.jobId}
            </span>
          ))}
        </div>
      ) : null}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Teste</th>
              <th>Agenda</th>
              <th>Status</th>
              <th>Última execução</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {cloudTests(catalog).map((test) => {
              const latest = runs?.runs.find((run) => run.target === test.target);
              const related = jobs.filter((job) => targetOfInputs(job.inputs) === test.target);
              const scheduled = related.some((job) => job.enabled);
              const suiteName = test.target === 'smoke' || test.target === 'regression' ? (test.target as keyof Suites) : null;
              return (
                <Fragment key={test.target}>
                  <tr className={scheduled ? 'is-scheduled' : 'is-paused'}>
                    <td>
                      <strong>{test.title}</strong>
                      {suiteName && catalog?.suites ? (
                        <div className="suite-specs">
                          {catalog.suites[suiteName].map((id) => catalog.specs?.find((s) => s.id === id)?.name ?? id).join(' · ')}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      {related.length ? (
                        related.map((job) => (
                          <div className="schedule-badge" key={job.id}>
                            <span className="schedule-interval">{describeCron(job.cron)}</span>
                            <LivePill live={job.enabled} />
                          </div>
                        ))
                      ) : (
                        <LivePill live={false} off="Sem agenda" />
                      )}
                    </td>
                    <td>
                      <Pill status={latest ? runStatus(latest) : 'idle'} />
                    </td>
                    <td>{latest ? ago(latest.createdAt) : '—'}</td>
                    <td>
                      <div className="row-actions">
                        <button className="compact" disabled={Boolean(busy) || !configured?.dispatch} onClick={() => void dispatch(test)}>
                          {busy === test.target ? 'Enviando…' : 'Executar'}
                        </button>
                        {suiteName && catalog?.suites ? (
                          <button className="secondary compact" onClick={() => setSuite({ name: suiteName, specs: catalog.suites![suiteName], error: '' })}>
                            Editar
                          </button>
                        ) : null}
                        {latest && runActive(latest) ? (
                          <button className="danger compact" onClick={() => void act(() => send('POST', `/api/cloud/runs/${latest.id}/cancel`))}>
                            Cancelar
                          </button>
                        ) : null}
                        {latest ? (
                          <button className="secondary compact" onClick={() => setViewer(latest)}>
                            Logs
                          </button>
                        ) : null}
                        {latest ? (
                          <a className="link" href={latest.url} target="_blank" rel="noreferrer">
                            GitHub
                          </a>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  {suite && suite.name === suiteName ? (
                    <tr className="edit-row">
                      <td colSpan={5}>
                        <form className="edit-form" onSubmit={(e) => void saveSuite(e)}>
                          <h3>Testes do {test.title}</h3>
                          <SpecPicker specs={catalog?.specs ?? []} selected={suite.specs} onChange={(specs) => setSuite({ ...suite, specs })} />
                          <p className="form-hint">Na nuvem vale depois do commit e push do suites.json. Aqui no local vale na hora.</p>
                          {suite.error ? <Notice bad>{suite.error}</Notice> : null}
                          <div className="row-actions">
                            <button type="submit">Salvar</button>
                            <button className="secondary" type="button" onClick={() => setSuite(undefined)}>
                              Cancelar
                            </button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {viewer ? <EvidenceViewer title={`${viewer.name} #${viewer.runNumber}`} load={cloudEvidence(viewer)} close={() => setViewer(undefined)} /> : null}
    </section>
  );
}
