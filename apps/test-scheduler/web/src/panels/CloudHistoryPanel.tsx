import { useEffect, useMemo, useState } from 'react';
import { attempt, send } from '../lib/api';
import { formatDate, formatDuration, maskBrDate, parseBrDate, statusLabel, toDateKey } from '../lib/format';
import { cloudEvidence } from '../lib/evidence';
import { EvidenceViewer, Notice, Pagination, PanelTitle, Pill } from '../components/ui';
import { runActive, runStatus } from './cloud';
import type { CloudRun, CloudRuns } from '../types';

export function CloudHistoryPanel({ runs, reload }: { runs?: CloudRuns; reload: () => Promise<void> }) {
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [viewer, setViewer] = useState<CloudRun>();
  const [message, setMessage] = useState('');
  const all = runs?.runs ?? [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const dateKey = parseBrDate(dateFilter);
    return all.filter((run) => {
      const status = runStatus(run);
      if (statusFilter && status !== statusFilter) return false;
      if (dateFilter.trim() && (!dateKey || toDateKey(run.createdAt) !== dateKey)) return false;
      if (q && !`${run.name} #${run.runNumber} ${statusLabel(status)} ${run.event} ${formatDate(run.createdAt)}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [all, dateFilter, query, statusFilter]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const items = filtered.slice((current - 1) * pageSize, current * pageSize);
  useEffect(() => setPage(1), [statusFilter, dateFilter, query, pageSize]);
  const statusOptions = [...new Set(all.map(runStatus))].sort();
  const hasFilters = Boolean(statusFilter || dateFilter.trim() || query.trim() || pageSize !== 10);

  return (
    <section className="panel">
      <PanelTitle title="Histórico">
        <button
          className="secondary compact"
          disabled={!hasFilters}
          onClick={() => {
            setStatusFilter('');
            setDateFilter('');
            setQuery('');
            setPageSize(10);
          }}
        >
          Limpar filtros
        </button>
        <button className="secondary compact" onClick={() => void reload()}>
          Atualizar
        </button>
      </PanelTitle>
      <div className="history-filters four">
        <label>
          Status
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Todos</option>
            {statusOptions.map((value) => (
              <option key={value} value={value}>
                {statusLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Data
          <input inputMode="numeric" placeholder="DD/MM/AAAA" maxLength={10} value={dateFilter} onChange={(e) => setDateFilter(maskBrDate(e.target.value))} />
        </label>
        <label>
          Busca
          <input placeholder="Suíte, número, status…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <label>
          Por página
          <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
            {[10, 20, 50].map((size) => (
              <option key={size}>{size}</option>
            ))}
          </select>
        </label>
      </div>
      {message ? <Notice bad>{message}</Notice> : null}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Execução</th>
              <th>Data</th>
              <th>Status</th>
              <th>Duração</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map((run) => (
              <tr key={run.id}>
                <td>
                  <strong>{run.name}</strong> <span className="meta">#{run.runNumber}</span>
                  <div className="meta">{run.event === 'schedule' ? 'agenda do GitHub' : run.event === 'workflow_dispatch' ? 'disparo manual ou do painel' : run.event}</div>
                </td>
                <td>{formatDate(run.createdAt)}</td>
                <td>
                  <Pill status={runStatus(run)} />
                </td>
                <td>{formatDuration(run.runStartedAt || run.createdAt, runActive(run) ? null : run.updatedAt)}</td>
                <td>
                  <div className="row-actions">
                    <button className="secondary compact" onClick={() => setViewer(run)}>
                      Ver
                    </button>
                    <a className="link" href={run.url} target="_blank" rel="noreferrer">
                      GitHub
                    </a>
                    {runActive(run) ? (
                      <button
                        className="danger compact"
                        onClick={async () => {
                          setMessage(await attempt(() => send('POST', `/api/cloud/runs/${run.id}/cancel`)));
                          await reload();
                        }}
                      >
                        Cancelar
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {!items.length ? (
              <tr>
                <td colSpan={5}>{all.length ? 'Nenhuma execução para os filtros.' : 'Nenhuma execução na nuvem ainda.'}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <Pagination total={filtered.length} page={current} pages={pages} onPage={setPage} />
      <div className="queue-summary">Evidências: logs, screenshots e vídeos ficam disponíveis no GitHub por 14 dias.</div>
      {viewer ? <EvidenceViewer title={`${viewer.name} #${viewer.runNumber}`} load={cloudEvidence(viewer)} close={() => setViewer(undefined)} /> : null}
    </section>
  );
}
