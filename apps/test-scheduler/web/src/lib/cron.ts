// Horários da agenda da nuvem em linguagem simples. O agendador roda o cron no
// fuso configurado (America/Sao_Paulo por padrão), então hora e minuto aqui
// já são locais, sem conversão para UTC.

export type EasySchedule =
  | { kind: 'every_hours'; hours: number; minute: number }
  | { kind: 'daily'; hour: number; minute: number }
  | { kind: 'weekdays'; hour: number; minute: number }
  | { kind: 'custom'; cron: string };

const pad2 = (n: number) => String(n).padStart(2, '0');

export function toCron(value: EasySchedule) {
  if (value.kind === 'custom') return value.cron.trim();
  if (value.kind === 'every_hours') return `${value.minute} */${value.hours} * * *`;
  if (value.kind === 'weekdays') return `${value.minute} ${value.hour} * * 1-5`;
  return `${value.minute} ${value.hour} * * *`;
}

export function parseCron(cron: string): EasySchedule {
  const text = cron.trim();
  let m = /^(\d{1,2}) \*\/(\d{1,2}) \* \* \*$/.exec(text);
  if (m) return { kind: 'every_hours', minute: Number(m[1]), hours: Number(m[2]) };
  m = /^(\d{1,2}) (\d{1,2}) \* \* \*$/.exec(text);
  if (m) return { kind: 'daily', minute: Number(m[1]), hour: Number(m[2]) };
  m = /^(\d{1,2}) (\d{1,2}) \* \* 1-5$/.exec(text);
  if (m) return { kind: 'weekdays', minute: Number(m[1]), hour: Number(m[2]) };
  return { kind: 'custom', cron: text };
}

export function describeCron(cron: string) {
  const easy = parseCron(cron);
  if (easy.kind === 'every_hours') return `A cada ${easy.hours}h (no minuto ${pad2(easy.minute)})`;
  if (easy.kind === 'daily') return `Todo dia às ${pad2(easy.hour)}:${pad2(easy.minute)}`;
  if (easy.kind === 'weekdays') return `Seg–sex às ${pad2(easy.hour)}:${pad2(easy.minute)}`;
  return `cron ${cron}`;
}
