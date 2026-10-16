import { useEffect, useMemo, useState } from 'react';
import { send, usePolling } from '../lib/api';
import { formatDate, formatDuration, maskBrDate, parseBrDate, statusLabel, toDateKey, withKind } from '../lib/format';
import { localEvidence } from '../lib/evidence';
import { ConfirmDialog, EvidenceViewer, Notice, Pagination, PanelTitle, Pill } from '../components/ui';
import type { HistoryItem, ProductId, Status, VideoItem } from '../types';

export function HistoryPanel({ product, status }: { product: ProductId; status?: Status }) {
  const { data: history, error, reload } = usePolling<HistoryItem[]>(`/api/history?product=${product}`, 5000);
  const { data: videos, reload: reloadVideos } = usePolling<VideoItem[]>(`/api/videos?product=${product}`, 8000);
  const [testFilter, setTestFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [viewer, setViewer] = useState<HistoryItem>();
  const [pendingClear, setPendingClear] = useState(false);
  const existingVideos = useMemo(() => new Set((videos ?? []).map((v) => v.name)), [videos]);
  const tests = status?.tests ?? [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const dateKey = parseBrDate(dateFilter);
    return (history ?? []).filter((item) => {
      if (testFilter && item.jobId !== testFilter) return false;
      if (statusFilter && item.status !== statusFilter) return false;
      if (dateFilter.trim() && (!dateKey || toDateKey(item.finishedAt || item.startedAt) !== dateKey)) return false;
      if (q) {
        const hay = `${withKind(item.kind, item.jobName)} ${item.jobId} ${statusLabel(item.status)} ${item.trigger} ${formatDate(item.startedAt)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [dateFilter, history, query, statusFilter, testFilter]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const items = filtered.slice((current - 1) * pageSize, current * pageSize);
  useEffect(() => setPage(1), [testFilter, statusFilter, dateFilter, query, pageSize]);

  const statusOptions = [...new Set((history ?? []).map((item) => item.status))].sort();
  const hasFilters = Boolean(testFilter || statusFilter || dateFilter.trim() || query.trim() || pageSize !== 10);
  const health = tests.filter((t) => t.kind === 'health');
  const e2e = tests.filter((t) => t.kind !== 'health');

  function clearFilters() {
    setTestFilter('');
    setStatusFilter('');
    setDateFilter('');
    setQuery('');
    setPageSize(10);
  }

  async function clearHistory() {
    await send('DELETE', `/api/history?product=${product}&videos=1`);
    setPendingClear(false);
    setViewer(undefined);
    await Promise.all([reload(), reloadVideos()]);
  }

  return (
    <section className="panel">
      <PanelTitle title="Histórico">
        <button className="secondary compact" disabled={!hasFilters} onClick={clearFilters}>
          Limpar filtros
        </button>
        <button className="danger compact" disabled={!history?.length && !videos?.length} onClick={() => setPendingClear(true)}>
          Excluir histórico
        </button>
        <button className="secondary compact" onClick={() => void Promise.all([reload(), reloadVideos()])}>
          Atualizar
        </button>
      </PanelTitle>
      <div className="history-filters">
        <label>
          Teste
          <select value={testFilter} onChange={(e) => setTestFilter(e.target.value)}>
            <option value="">Todos</option>
            {health.length ? (
              <optgroup label="Health checks">
                {health.map((t) => (
                  <option key={t.id} value={t.id}>
                    {withKind('health', t.name)}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {e2e.length ? (
              <optgroup label="Testes">
                {e2e.map((t) => (
                  <option key={t.id} value={t.id}>
                    {withKind(t.kind, t.name)}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </label>
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
          <input placeholder="Nome, status, origem…" value={query} onChange={(e) => setQuery(e.target.value)} />
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
      {error ? <Notice>Histórico indisponível: {error}</Notice> : null}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Teste</th>
              <th>Data</th>
              <th>Status</th>
              <th>Duração</th>
              <th>Vídeo</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const video = item.video && existingVideos.has(item.video) ? item.video : null;
              return (
                <tr key={item.runId}>
                  <td>
                    <strong>{withKind(item.kind, item.jobName)}</strong>
                    {item.trigger === 'triagem' ? <div className="meta">repetição da triagem</div> : null}
                  </td>
                  <td>{formatDate(item.finishedAt || item.startedAt)}</td>
                  <td>
                    <Pill status={item.status} />
                  </td>
                  <td>{formatDuration(item.startedAt, item.finishedAt)}</td>
                  <td>
                    {/* Sem vídeo o botão também abre: é ali que o painel explica o motivo. */}
                    <button className="secondary compact" onClick={() => setViewer({ ...item, video })}>
                      {video ? 'Ver' : 'Sem vídeo'}
                    </button>
                  </td>
                </tr>
              );
            })}
            {!items.length ? (
              <tr>
                <td colSpan={5}>{history?.length ? 'Nenhum resultado para os filtros.' : 'Ainda não há execuções.'}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <Pagination total={filtered.length} page={current} pages={pages} onPage={setPage} />
      {videos?.length ? <div className="queue-summary">Vídeos guardados: {videos.length} (até 3 por teste, só de falhas)</div> : null}
      {viewer ? (
        <EvidenceViewer title={withKind(viewer.kind, viewer.jobName)} load={localEvidence({ runId: viewer.runId, status: viewer.status, kind: viewer.kind, video: viewer.video })} close={() => setViewer(undefined)} />
      ) : null}
      {pendingClear ? (
        <ConfirmDialog
          title="Excluir histórico?"
          message="Apaga as execuções guardadas deste produto e os vídeos em disco. Os testes, as agendas e o emulador continuam como estão."
          onCancel={() => setPendingClear(false)}
          onConfirm={() => void clearHistory()}
        />
      ) : null}
    </section>
  );
}
