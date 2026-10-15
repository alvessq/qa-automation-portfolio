import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isDue, isWithinWindow, minuteOfDay, nextRunAt, parseTime } from '../src/schedule-window.mjs';

const TZ = 'UTC';
const at = (hhmm, day = '2026-01-15') => new Date(`${day}T${hhmm}:00Z`);
const job = (overrides = {}) => ({
  id: 'job',
  enabled: true,
  intervalMinutes: 60,
  window: { from: '08:00', to: '18:00' },
  ...overrides,
});

describe('parseTime', () => {
  it('converte HH:MM em minutos do dia', () => {
    assert.equal(parseTime('00:00'), 0);
    assert.equal(parseTime('08:30'), 510);
    assert.equal(parseTime('23:59'), 1439);
  });

  it('rejeita formatos inválidos', () => {
    for (const value of ['8:30', '24:00', '12:60', '', null, 'abc']) {
      assert.throws(() => parseTime(value), /horário inválido/);
    }
  });
});

describe('minuteOfDay', () => {
  it('respeita o fuso informado', () => {
    const date = at('12:00');
    assert.equal(minuteOfDay(date, 'UTC'), 720);
    assert.equal(minuteOfDay(date, 'America/Sao_Paulo'), 540);
  });
});

describe('isWithinWindow', () => {
  const day = { from: '08:00', to: '18:00' };
  const night = { from: '22:00', to: '06:00' };

  it('sem janela, sempre pode rodar', () => {
    assert.equal(isWithinWindow(at('03:00'), null, TZ), true);
  });

  it('inclui o início e exclui o fim da janela', () => {
    assert.equal(isWithinWindow(at('08:00'), day, TZ), true);
    assert.equal(isWithinWindow(at('17:59'), day, TZ), true);
    assert.equal(isWithinWindow(at('18:00'), day, TZ), false);
    assert.equal(isWithinWindow(at('07:59'), day, TZ), false);
  });

  it('suporta janela que atravessa a meia-noite', () => {
    assert.equal(isWithinWindow(at('23:30'), night, TZ), true);
    assert.equal(isWithinWindow(at('02:00'), night, TZ), true);
    assert.equal(isWithinWindow(at('12:00'), night, TZ), false);
  });
});

describe('isDue', () => {
  it('roda na primeira vez quando está dentro da janela', () => {
    assert.equal(isDue(job(), null, at('09:00'), TZ), true);
  });

  it('não roda fora da janela nem desativado', () => {
    assert.equal(isDue(job(), null, at('20:00'), TZ), false);
    assert.equal(isDue(job({ enabled: false }), null, at('09:00'), TZ), false);
  });

  it('espera o intervalo desde a última execução', () => {
    assert.equal(isDue(job(), at('09:00').toISOString(), at('09:59'), TZ), false);
    assert.equal(isDue(job(), at('09:00').toISOString(), at('10:00'), TZ), true);
  });
});

describe('nextRunAt', () => {
  it('é agora quando nunca rodou e está na janela', () => {
    assert.deepEqual(nextRunAt(job(), null, at('09:00'), TZ), at('09:00'));
  });

  it('soma o intervalo à última execução', () => {
    assert.deepEqual(nextRunAt(job(), at('09:00').toISOString(), at('09:10'), TZ), at('10:00'));
  });

  it('pula para a abertura da próxima janela', () => {
    assert.deepEqual(nextRunAt(job(), at('17:30').toISOString(), at('17:40'), TZ), at('08:00', '2026-01-16'));
  });

  it('é null para job desativado', () => {
    assert.equal(nextRunAt(job({ enabled: false }), null, at('09:00'), TZ), null);
  });
});
