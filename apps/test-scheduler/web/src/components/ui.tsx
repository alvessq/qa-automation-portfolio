import { useEffect, useState, type ReactNode } from 'react';
import { formatWhen, isScheduleLive, statusLabel, tone, windowLabel } from '../lib/format';
import type { SpecOption, Window } from '../types';

export function Pill({ status, label }: { status?: string | null; label?: string }) {
  return <span className={`pill ${tone(status)}`}>{label ?? statusLabel(status)}</span>;
}

export function LivePill({ live, on = 'Ativa', off = 'Pausada' }: { live: boolean; on?: string; off?: string }) {
  return (
    <span className={`pill ${live ? 'active' : 'paused'}`}>
      <span className="pill-dot" aria-hidden="true" />
      {live ? on : off}
    </span>
  );
}

/** Agenda de um teste local: intervalo, janela, se está valendo agora e a próxima execução. */
export function ScheduleBadge({ enabled, minutes, window, nextRunAt }: { enabled: boolean; minutes: number; window: Window; nextRunAt?: string | null }) {
  const live = isScheduleLive(enabled, window);
  const next = enabled ? formatWhen(nextRunAt) : '';
  return (
    <div className="schedule-badge">
      <div className="schedule-stack">
        <span className="schedule-interval">a cada {minutes} min</span>
        <span className="schedule-window">{windowLabel(window)}</span>
        {enabled && !live ? <span className="meta">fora da janela</span> : null}
        {next ? <span className="meta">próximo {next}</span> : null}
      </div>
      <LivePill live={live} />
    </div>
  );
}

export type Metric = { label: string; value: number | string; tone?: 'ok' | 'bad' };

export function Metrics({ items }: { items: Metric[] }) {
  return (
    <section className="summary-strip" aria-label="Resumo">
      {items.map((item) => (
        <strong key={item.label} className={item.tone ?? ''}>
          {item.value}
          <small>{item.label}</small>
        </strong>
      ))}
    </section>
  );
}

export function PanelTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="panel-title">
      <h2>{title}</h2>
      {children ? <div className="panel-tools">{children}</div> : null}
    </div>
  );
}

export function Notice({ children, bad = false }: { children: ReactNode; bad?: boolean }) {
  return <div className={`notice ${bad ? 'bad' : ''}`}>{children}</div>;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Excluir',
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEscape(onCancel);
  return (
    <div className="confirm-backdrop" onClick={onCancel} role="presentation">
      <div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message" onClick={(e) => e.stopPropagation()}>
        <h3 id="confirm-title">{title}</h3>
        <p id="confirm-message">{message}</p>
        <div className="row-actions">
          <button className="secondary" type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button className="danger" type="button" onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);
}

export type ViewerMedia = { video?: string | null; absence: string; links?: Array<{ label: string; href: string }> };

/** Janela de evidências: vídeo (ou o motivo de não haver) à esquerda, log à direita. */
export function EvidenceViewer({ title, load, close }: { title: string; load: () => Promise<{ logs: string; media: ViewerMedia }>; close: () => void }) {
  const [content, setContent] = useState<{ logs: string; media: ViewerMedia }>();
  useEscape(close);
  useEffect(() => {
    let alive = true;
    load()
      .then((value) => alive && setContent(value))
      .catch((error: Error) => alive && setContent({ logs: error.message, media: { absence: 'Não foi possível carregar as evidências.' } }));
    return () => {
      alive = false;
    };
    // Carrega uma vez ao abrir: o painel por trás se atualiza e recria `load` a cada poucos segundos.
  }, []);
  return (
    <div className="log-modal media-modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="panel-title">
        <h3>{title}</h3>
        <button className="secondary compact" onClick={close}>
          Fechar
        </button>
      </div>
      <div className="media-grid">
        <div className="media-side">
          {content?.media.video ? (
            <video controls preload="metadata" src={content.media.video} />
          ) : (
            <div className="empty">{content ? content.media.absence : 'Carregando…'}</div>
          )}
          {content?.media.links?.length ? (
            <div className="media-links">
              {content.media.links.map((link) => (
                <a className="link" href={link.href} target="_blank" rel="noreferrer" key={link.href}>
                  {link.label}
                </a>
              ))}
            </div>
          ) : null}
        </div>
        <pre>{content ? content.logs || 'Sem saída registrada.' : 'Carregando…'}</pre>
      </div>
    </div>
  );
}

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

/** Hora em 24h com dois selects: evita o seletor AM/PM do navegador. */
export function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [hour = '08', minute = '00'] = value.split(':');
  const minutes = MINUTES.includes(minute) ? MINUTES : [...MINUTES, minute].sort();
  return (
    <span className="time-24" role="group" aria-label={label}>
      <select aria-label={`${label}: hora`} value={hour} onChange={(e) => onChange(`${e.target.value}:${minute}`)}>
        {HOURS.map((h) => (
          <option key={h}>{h}</option>
        ))}
      </select>
      <span>:</span>
      <select aria-label={`${label}: minuto`} value={minute} onChange={(e) => onChange(`${hour}:${e.target.value}`)}>
        {minutes.map((m) => (
          <option key={m}>{m}</option>
        ))}
      </select>
    </span>
  );
}

/** Janela de horário: o dia todo ou "de … até …". */
export function WindowFields({ value, onChange }: { value: Window; onChange: (value: Window) => void }) {
  return (
    <>
      <label className="check">
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked ? { from: '08:00', to: '18:00' } : null)} />
        Só dentro de um horário
      </label>
      {value ? (
        <>
          <label>
            Das
            <TimeField label="Início da janela" value={value.from} onChange={(from) => onChange({ ...value, from })} />
          </label>
          <label>
            Até
            <TimeField label="Fim da janela" value={value.to} onChange={(to) => onChange({ ...value, to })} />
          </label>
        </>
      ) : null}
    </>
  );
}

export function SpecPicker({ specs, selected, onChange }: { specs: SpecOption[]; selected: string[]; onChange: (ids: string[]) => void }) {
  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(specs.map((s) => s.id).filter((s) => next.has(s)));
  }
  return (
    <fieldset className="spec-picker">
      <legend>Quais testes entram nesta suíte</legend>
      <div className="spec-list">
        {specs.map((spec) => (
          <label className="spec-option" key={spec.id}>
            <input type="checkbox" checked={selected.includes(spec.id)} onChange={() => toggle(spec.id)} />
            {spec.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Pagination({ total, page, pages, onPage }: { total: number; page: number; pages: number; onPage: (page: number) => void }) {
  return (
    <div className="history-pagination">
      <span>
        {total} resultado{total === 1 ? '' : 's'} · página {page} de {pages}
      </span>
      <div className="row-actions">
        <button className="secondary compact" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Anterior
        </button>
        <button className="secondary compact" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Próxima
        </button>
      </div>
    </div>
  );
}
