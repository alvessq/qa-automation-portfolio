import { api, text } from './api';
import { formatDate, formatDuration, statusLabel, videoAbsenceReason } from './format';
import type { CloudRun, Kind, Media } from '../types';
import type { ViewerMedia } from '../components/ui';

type RunRef = { runId: string; status: string; kind: Kind; video?: string | null };

/** Evidências de uma execução local: saída do comando e vídeo, quando houver. */
export function localEvidence(run: RunRef) {
  return async () => {
    const detail = await api<{ output: string; startedAt: string; finishedAt: string | null; exitCode: number | null; trigger: string }>(`/api/history/${run.runId}`);
    const header = [
      `Status: ${statusLabel(run.status)}`,
      `Início: ${formatDate(detail.startedAt)} · duração ${formatDuration(detail.startedAt, detail.finishedAt)}`,
      `Origem: ${detail.trigger}${detail.exitCode !== null ? ` · código de saída ${detail.exitCode}` : ''}`,
      '',
    ].join('\n');
    const media: ViewerMedia = {
      video: run.kind !== 'health' && run.video ? `/api/videos/${encodeURIComponent(run.video)}` : null,
      absence: videoAbsenceReason(run.status, run.kind),
    };
    return { logs: header + (detail.output || 'Sem saída registrada nesta execução.'), media };
  };
}

/** Evidências de uma execução da nuvem: logs dos passos, vídeo e screenshots dos artifacts. */
export function cloudEvidence(run: CloudRun) {
  return async () => {
    const base = `/api/cloud/runs/${run.id}`;
    const [logs, media] = await Promise.all([text(`${base}/logs`), api<Media[]>(`${base}/media`).catch(() => [] as Media[])]);
    const video = media.find((m) => m.type.startsWith('video/'));
    const images = media.filter((m) => m.type.startsWith('image/'));
    const url = (m: Media) => `${base}/media/${encodeURIComponent(m.name)}`;
    const viewer: ViewerMedia = {
      video: video ? url(video) : null,
      absence: images.length
        ? 'Sem vídeo: na nuvem o emulador roda sem placa de vídeo e a gravação fica desligada. Os screenshots das falhas estão logo abaixo.'
        : 'Sem vídeo nem screenshots: a execução passou, ainda não terminou ou as evidências já expiraram (ficam 14 dias no GitHub).',
      links: images.map((m, i) => ({ label: `Screenshot ${i + 1}`, href: url(m) })),
    };
    return { logs, media: viewer };
  };
}
