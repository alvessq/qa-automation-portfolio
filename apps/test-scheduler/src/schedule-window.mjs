// Regras de agenda: janela de horário diária e cálculo da próxima execução.
// Funções puras (recebem `now`), para serem testadas sem relógio real.

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MINUTE_MS = 60_000;
// Limite de busca da próxima execução: qualquer janela válida abre em até 1 dia.
const MAX_LOOKAHEAD_MINUTES = 2 * 24 * 60;

/** "08:30" -> 510. Lança erro para formatos inválidos. */
export function parseTime(value) {
  const match = TIME_PATTERN.exec(String(value ?? ''));
  if (!match) throw new Error(`horário inválido: "${value}" (use HH:MM)`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Minuto do dia (0–1439) de `date` no fuso informado. */
export function minuteOfDay(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return get('hour') * 60 + get('minute');
}

/**
 * A janela é [from, to). `from > to` indica janela que atravessa a
 * meia-noite (ex.: 22:00–06:00). Sem janela, o job pode rodar a qualquer hora.
 */
export function isWithinWindow(date, window, timeZone) {
  if (!window) return true;
  const from = parseTime(window.from);
  const to = parseTime(window.to);
  const now = minuteOfDay(date, timeZone);
  if (from === to) return true;
  return from < to ? now >= from && now < to : now >= from || now < to;
}

/** O job deve ser enfileirado agora? */
export function isDue(job, lastStartedAt, now, timeZone) {
  if (!job.enabled) return false;
  if (!isWithinWindow(now, job.window, timeZone)) return false;
  if (!lastStartedAt) return true;
  return now.getTime() - new Date(lastStartedAt).getTime() >= job.intervalMinutes * MINUTE_MS;
}

/** Próximo instante em que o job ficará elegível (null se desativado). */
export function nextRunAt(job, lastStartedAt, now, timeZone) {
  if (!job.enabled) return null;
  const earliest = lastStartedAt ? new Date(lastStartedAt).getTime() + job.intervalMinutes * MINUTE_MS : now.getTime();
  let candidate = new Date(Math.max(earliest, now.getTime()));
  candidate.setSeconds(0, 0);
  for (let i = 0; i < MAX_LOOKAHEAD_MINUTES; i++) {
    if (isWithinWindow(candidate, job.window, timeZone)) return candidate;
    candidate = new Date(candidate.getTime() + MINUTE_MS);
  }
  return null;
}
