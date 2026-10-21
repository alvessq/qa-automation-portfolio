import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkHealth, parseDeviceStates, prepareForSuite, resetTuning } from './lib/emulator-health.mjs';
import { decideRecycle } from './lib/recycle.mjs';

/** adb falso: `estados` é a sequência de respostas de get-state e boot_completed. */
function adbFalso({ estados = [['device', '1']], aposReinicio = null } = {}) {
  const chamadas = [];
  let i = 0;
  let reiniciado = false;
  const atual = () => (reiniciado && aposReinicio ? aposReinicio : estados[Math.min(i, estados.length - 1)]);
  const run = (args) => {
    chamadas.push(args.join(' '));
    if (args.includes('get-state')) {
      const [state] = atual();
      return { ok: state === 'device', stdout: state };
    }
    if (args.includes('sys.boot_completed')) {
      const [, boot] = atual();
      i++;
      return { ok: true, stdout: boot };
    }
    if (args.includes('reboot')) reiniciado = true;
    return { ok: true, stdout: '' };
  };
  return { run, chamadas };
}

const semEspera = { sleep: async () => {}, bootTimeoutMs: 0 };

describe('saúde do emulador', () => {
  it('só é saudável com o device online e o Android ligado', () => {
    assert.equal(checkHealth(adbFalso({ estados: [['device', '1']] }).run, 'emulator-5554').healthy, true);
    assert.match(checkHealth(adbFalso({ estados: [['offline', '']] }).run, 'emulator-5554').reason, /"offline"/);
    assert.match(checkHealth(adbFalso({ estados: [['device', '0']] }).run, 'emulator-5554').reason, /não terminou de ligar/);
  });

  it('lista devices em qualquer estado', () => {
    const saida = 'List of devices attached\nemulator-5554\toffline\nemulator-5556\tdevice\n';
    assert.deepEqual(parseDeviceStates(saida), [
      { serial: 'emulator-5554', state: 'offline' },
      { serial: 'emulator-5556', state: 'device' },
    ]);
  });
});

describe('preparo antes da suíte', () => {
  it('saudável: aplica os ajustes da CI sem reiniciar', async () => {
    const { run, chamadas } = adbFalso();
    const r = await prepareForSuite(run, 'emulator-5554', semEspera);
    assert.deepEqual([r.ok, r.rebooted], [true, false]);
    assert.ok(chamadas.some((c) => c.includes('wm size 720x1600')));
    assert.ok(chamadas.some((c) => c.includes('CLOSE_SYSTEM_DIALOGS')));
    assert.ok(!chamadas.some((c) => c.includes('reboot')));
  });

  it('offline: reinicia uma vez e segue se voltar', async () => {
    const { run, chamadas } = adbFalso({ estados: [['offline', '']], aposReinicio: ['device', '1'] });
    const r = await prepareForSuite(run, 'emulator-5554', semEspera);
    assert.deepEqual([r.ok, r.rebooted], [true, true]);
    assert.equal(chamadas.filter((c) => c.includes('reboot')).length, 1);
  });

  it('não volta depois do reinício: falha com "device offline", sem tentar de novo', async () => {
    const { run, chamadas } = adbFalso({ estados: [['offline', '']] });
    const r = await prepareForSuite(run, 'emulator-5554', semEspera);
    assert.equal(r.ok, false);
    assert.match(r.reason, /device offline/);
    assert.equal(chamadas.filter((c) => c.includes('reboot')).length, 1);
    assert.ok(!chamadas.some((c) => c.includes('wm size 720x1600')));
  });

  it('desfaz os ajustes de tela', () => {
    const { run, chamadas } = adbFalso();
    resetTuning(run, 'emulator-5554');
    assert.ok(chamadas.some((c) => c.includes('wm size reset')));
    assert.ok(chamadas.some((c) => c.includes('wm density reset')));
  });
});

describe('reciclagem com saúde', () => {
  it('reinicia na hora quando o emulador não está saudável', () => {
    assert.deepEqual(decideRecycle({ healthy: false, count: 0 }), { action: 'restart', reason: 'o emulador não está saudável' });
  });

  it('na CI e em device físico a saúde não muda nada aqui', () => {
    assert.equal(decideRecycle({ ci: true, healthy: false }).action, 'skip');
    assert.equal(decideRecycle({ isEmulator: false, healthy: false }).action, 'skip');
  });
});
