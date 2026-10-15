import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createWatchdog, downMessage } from './lib/watchdog.mjs';
import { parseDevices } from './lib/android.mjs';
import { emulatorArgs, pickAvd, portOf } from './lib/emulator.mjs';
import { createCounter, decideRecycle } from './lib/recycle.mjs';
import { ciEnv, parseArgs } from './ci-local.mjs';

describe('createWatchdog', () => {
  const answers = (...list) => () => list.shift();

  it('só declara queda depois de falhas seguidas', () => {
    let calls = 0;
    const dog = createWatchdog({ probe: answers(false, true, false, false), onDown: () => calls++ });
    assert.equal(dog.tick(), 'miss');
    assert.equal(dog.tick(), 'up');
    assert.equal(dog.tick(), 'miss');
    assert.equal(dog.tick(), 'down');
    assert.equal(calls, 1);
    assert.equal(dog.isDown(), true);
  });

  it('avisa uma única vez e para de perguntar ao adb', () => {
    let probes = 0;
    let calls = 0;
    const dog = createWatchdog({ probe: () => (probes++, false), maxMisses: 1, onDown: () => calls++ });
    dog.tick();
    dog.tick();
    assert.equal(calls, 1);
    assert.equal(probes, 1);
  });

  it('a mensagem de queda é reconhecida como problema de ambiente pela triagem', () => {
    assert.match(downMessage('emulator-5554'), /device (is )?offline/i);
  });
});

describe('android e emulador', () => {
  it('parseDevices ignora devices offline e não autorizados', () => {
    const output = 'List of devices attached\nemulator-5554\tdevice\nemulator-5556\toffline\nR58M\tunauthorized\n';
    assert.deepEqual(parseDevices(output), ['emulator-5554']);
  });

  it('emulatorArgs: padrão com janela e GPU; headless repete a CI', () => {
    assert.deepEqual(emulatorArgs({ avd: 'Pixel_6' }), ['-avd', 'Pixel_6', '-gpu', 'host']);
    const ci = emulatorArgs({ avd: 'Pixel_6', port: 5556, headless: true });
    assert.deepEqual(ci.slice(0, 4), ['-avd', 'Pixel_6', '-port', '5556']);
    assert.ok(ci.includes('-no-window'));
    assert.equal(ci[ci.indexOf('-gpu') + 1], 'swiftshader_indirect');
    const ciGpu = emulatorArgs({ avd: 'x', headless: true, gpu: true });
    assert.equal(ciGpu[ciGpu.indexOf('-gpu') + 1], 'host');
  });

  it('pickAvd escolhe o pedido ou o primeiro', () => {
    assert.equal(pickAvd(['A', 'B'], 'B'), 'B');
    assert.equal(pickAvd(['A', 'B']), 'A');
    assert.equal(pickAvd(['A'], 'Z'), null);
    assert.equal(pickAvd([]), null);
  });

  it('portOf lê a porta do serial do emulador', () => {
    assert.equal(portOf('emulator-5556'), 5556);
    assert.equal(portOf('R58M123'), null);
  });
});

describe('reciclagem', () => {
  it('mantém até completar o intervalo e reinicia ao atingir', () => {
    assert.equal(decideRecycle({ count: 2, every: 3 }).action, 'keep');
    assert.equal(decideRecycle({ count: 3, every: 3 }).action, 'restart');
  });

  it('não se aplica na CI, em device físico, desligada ou com intervalo 0', () => {
    assert.equal(decideRecycle({ ci: true, count: 9 }).action, 'skip');
    assert.equal(decideRecycle({ isEmulator: false, count: 9 }).action, 'skip');
    assert.equal(decideRecycle({ enabled: false, count: 9 }).action, 'skip');
    assert.equal(decideRecycle({ count: 9, every: 0 }).action, 'keep');
  });

  it('o contador é por device e sobrevive entre processos', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'recycle-')), 'runs.json');
    const a = createCounter(file);
    a.increment('emulator-5554');
    a.increment('emulator-5554');
    const b = createCounter(file);
    assert.equal(b.get('emulator-5554'), 2);
    assert.equal(b.get('emulator-5556'), 0);
    b.reset('emulator-5554');
    assert.equal(a.get('emulator-5554'), 0);
  });
});

describe('ci-local', () => {
  it('usa smoke e sem GPU por padrão', () => {
    assert.deepEqual(parseArgs([]), { suite: 'smoke', gpu: false, keep: false });
    assert.deepEqual(parseArgs(['regression', '--gpu']), { suite: 'regression', gpu: true, keep: false });
  });

  it('roda a suíte com o ambiente da CI no device novo e sem reciclagem', () => {
    const env = ciEnv({ PATH: '/bin', RECORD_VIDEO: 'true' }, 'emulator-5556');
    assert.equal(env.CI, 'true');
    assert.equal(env.ANDROID_UDID, 'emulator-5556');
    assert.equal(env.RECORD_VIDEO, 'false');
    assert.equal(env.EMULATOR_RECYCLE, 'false');
    assert.equal(env.PATH, '/bin');
  });
});
