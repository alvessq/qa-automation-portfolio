import { useEffect, useState } from 'react';
import { describeCron, parseCron, toCron, type EasySchedule } from '../lib/cron';

const pad2 = (n: number) => String(n).padStart(2, '0');
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
const EVERY = [1, 2, 3, 4, 6, 8, 12];

/** "Quando" da agenda da nuvem: opções simples, com cron só no modo avançado. */
export function ScheduleWhenEditor({ value, onChange }: { value: string; onChange: (cron: string) => void }) {
  const [easy, setEasy] = useState<EasySchedule>(() => parseCron(value));
  useEffect(() => setEasy(parseCron(value)), [value]);

  function commit(next: EasySchedule) {
    setEasy(next);
    onChange(toCron(next));
  }

  return (
    <div className="schedule-when">
      <select
        aria-label="Frequência"
        value={easy.kind}
        onChange={(e) => {
          const kind = e.target.value as EasySchedule['kind'];
          if (kind === 'every_hours') commit({ kind, hours: 6, minute: 0 });
          else if (kind === 'custom') commit({ kind, cron: value || '0 */6 * * *' });
          else commit({ kind, hour: 9, minute: 0 });
        }}
      >
        <option value="every_hours">A cada X horas</option>
        <option value="daily">Todo dia</option>
        <option value="weekdays">Segunda a sexta</option>
        <option value="custom">Avançado (cron)</option>
      </select>
      {easy.kind === 'every_hours' ? (
        <>
          <select aria-label="Intervalo em horas" value={easy.hours} onChange={(e) => commit({ ...easy, hours: Number(e.target.value) })}>
            {EVERY.map((h) => (
              <option key={h} value={h}>
                a cada {h}h
              </option>
            ))}
          </select>
          <select aria-label="Minuto" value={easy.minute} onChange={(e) => commit({ ...easy, minute: Number(e.target.value) })}>
            {MINUTES.map((m) => (
              <option key={m} value={m}>
                no minuto {pad2(m)}
              </option>
            ))}
          </select>
        </>
      ) : null}
      {easy.kind === 'daily' || easy.kind === 'weekdays' ? (
        <>
          <select aria-label="Hora" value={easy.hour} onChange={(e) => commit({ ...easy, hour: Number(e.target.value) })}>
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {pad2(h)}h
              </option>
            ))}
          </select>
          <select aria-label="Minuto" value={easy.minute} onChange={(e) => commit({ ...easy, minute: Number(e.target.value) })}>
            {MINUTES.map((m) => (
              <option key={m} value={m}>
                {pad2(m)} min
              </option>
            ))}
          </select>
        </>
      ) : null}
      {easy.kind === 'custom' ? (
        <input className="cron-input" aria-label="Expressão cron" required value={easy.cron} onChange={(e) => commit({ kind: 'custom', cron: e.target.value })} placeholder="0 */6 * * *" />
      ) : null}
      <small className="schedule-when-hint">{describeCron(toCron(easy))}</small>
    </div>
  );
}
