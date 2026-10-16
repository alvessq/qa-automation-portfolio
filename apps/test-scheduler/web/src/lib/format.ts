import type { Kind, Window } from '../types';

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Texto livre vira um pedaço de id: minúsculas, sem acento, com hífen. */
export const slug = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);

export function ago(value?: string | null) {
  if (!value) return 'sem execução';
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 1000));
  if (seconds < 60) return `há ${seconds}s`;
  if (seconds < 3600) return `há ${Math.round(seconds / 60)}min`;
  if (seconds < 86400) return `há ${Math.round(seconds / 3600)}h`;
  return `há ${Math.round(seconds / 86400)}d`;
}

export function formatDate(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** "16/10 14:30": usado em "próximo …". */
export function formatWhen(value?: string | null) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Execução em andamento não tem fim: conta até agora. */
export function formatDuration(startedAt?: string | null, finishedAt?: string | null) {
  if (!startedAt) return '—';
  const start = Date.parse(startedAt);
  const end = finishedAt ? Date.parse(finishedAt) : Date.now();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return '—';
  const seconds = Math.round((end - start) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m${pad2(seconds % 60)}s`;
  return `${Math.floor(minutes / 60)}h${pad2(minutes % 60)}m`;
}

export function toDateKey(value?: string | null) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** DD/MM/AAAA → AAAA-MM-DD; vazio se a data não existe. */
export function parseBrDate(value: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return '';
  const [, dd, mm, yyyy] = match;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  if (d.getFullYear() !== Number(yyyy) || d.getMonth() !== Number(mm) - 1 || d.getDate() !== Number(dd)) return '';
  return `${yyyy}-${mm}-${dd}`;
}

/** Digitação livre vira DD/MM/AAAA. */
export function maskBrDate(raw: string) {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length > 4) return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  if (digits.length > 2) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return digits;
}

export type Tone = 'passed' | 'failed' | 'running' | 'queued' | 'active' | 'paused' | 'idle';

export function tone(status?: string | null): Tone {
  const key = (status || '').toLowerCase();
  if (['queued', 'pending', 'waiting', 'requested'].includes(key)) return 'queued';
  if (['running', 'in_progress'].includes(key)) return 'running';
  if (['failed', 'failure', 'timeout', 'timed_out', 'cancelled', 'stopped', 'startup_failure', 'bug', 'error'].includes(key)) return 'failed';
  if (['passed', 'success', 'dispatched'].includes(key)) return 'passed';
  if (['active', 'enabled'].includes(key)) return 'active';
  if (['paused', 'disabled', 'skipped', 'flaky'].includes(key)) return 'paused';
  return 'idle';
}

const LABELS: Record<string, string> = {
  running: 'Executando',
  in_progress: 'Executando',
  queued: 'Na fila',
  pending: 'Na fila',
  waiting: 'Na fila',
  requested: 'Na fila',
  failed: 'Falhou',
  failure: 'Falhou',
  timeout: 'Tempo esgotado',
  timed_out: 'Tempo esgotado',
  startup_failure: 'Falhou ao iniciar',
  passed: 'Aprovado',
  success: 'Aprovado',
  stopped: 'Interrompido',
  cancelled: 'Cancelado',
  skipped: 'Ignorado',
  idle: 'Sem execução',
  completed: 'Concluído',
  dispatched: 'Disparado',
  bug: 'Bug',
  flaky: 'Passageira',
  environment: 'Ambiente',
};

export const statusLabel = (status?: string | null) => LABELS[(status || '').toLowerCase()] ?? status ?? '—';

const parseHm = (value?: string) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

/** Mesma regra do agendador: [de, até), atravessando a meia-noite se de > até. */
export function isWithinWindow(window: Window, now = new Date()) {
  if (!window) return true;
  const from = parseHm(window.from);
  const to = parseHm(window.to);
  if (from === null || to === null || from === to) return true;
  const current = now.getHours() * 60 + now.getMinutes();
  return from < to ? current >= from && current < to : current >= from || current < to;
}

export const isScheduleLive = (enabled: boolean, window: Window) => enabled && isWithinWindow(window);
export const windowLabel = (window: Window) => (window ? `${window.from}–${window.to}` : 'o dia todo');

export const kindLabel = (kind: Kind) => (kind === 'health' ? 'Health' : 'E2E');
export const withKind = (kind: Kind, name: string) => `${kindLabel(kind)} · ${name}`;

/**
 * O vídeo só é guardado quando o teste falha; o visualizador explica por que
 * não há vídeo em vez de mostrar uma área vazia.
 */
export function videoAbsenceReason(status?: string | null, kind?: Kind) {
  if (kind === 'health') return 'Health check não grava vídeo: são só consultas rápidas, sem abrir o app.';
  switch ((status || '').toLowerCase()) {
    case 'passed':
      return 'Sem vídeo: a tela é gravada sempre, mas o arquivo só fica guardado quando o teste falha.';
    case 'failed':
    case 'timeout':
      return 'Falha sem vídeo: o teste quebrou antes de abrir o app, ou o arquivo já saiu (ficam os 3 mais recentes de cada teste).';
    case 'stopped':
      return 'Execução interrompida no meio: não há vídeo desta vez.';
    case 'running':
    case 'queued':
      return 'Execução em andamento: o vídeo só é salvo no fim, e apenas se falhar.';
    default:
      return 'Sem vídeo: este teste ainda não falhou desde a última limpeza.';
  }
}
