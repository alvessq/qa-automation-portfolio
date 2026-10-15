import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createWatchdog, downMessage } from './lib/watchdog.mjs';
import { parseDevices } from './lib/android.mjs';
import { ciEnv, emulatorArgs, parseArgs, pickAvd } from './ci-local.mjs';

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

describe('parseDevices', () => {
  it('ignora devices offline e não autorizados', () => {
    const output = 'List of devices attached\nemulator-5554\tdevice\nemulator-5556\toffline\nR58M\tunauthorized\n';
    assert.deepEqual(parseDevices(output), ['emulator-5554']);
  });
});

describe('ci-local', () => {
  it('usa smoke e sem GPU por padrão', () => {
    assert.deepEqual(parseArgs([]), { suite: 'smoke', gpu: false, keep: false });
    assert.deepEqual(parseArgs(['regression', '--gpu']), { suite: 'regression', gpu: true, keep: false });
  });

  it('repete as opções do emulador da CI', () => {
    const args = emulatorArgs({ avd: 'Pixel_6', port: 5556 });
    assert.deepEqual(args.slice(0, 4), ['-avd', 'Pixel_6', '-port', '5556']);
    assert.ok(args.includes('-no-window'));
    assert.equal(args[args.indexOf('-gpu') + 1], 'swiftshader_indirect');
    assert.equal(emulatorArgs({ avd: 'x', gpu: true })[emulatorArgs({ avd: 'x', gpu: true }).indexOf('-gpu') + 1], 'host');
  });

  it('escolhe o AVD pedido ou o primeiro da lista', () => {
    assert.equal(pickAvd(['A', 'B'], 'B'), 'B');
    assert.equal(pickAvd(['A', 'B']), 'A');
    assert.equal(pickAvd(['A'], 'Z'), null);
    assert.equal(pickAvd([]), null);
  });

  it('roda a suíte com o ambiente da CI no device novo', () => {
    const env = ciEnv({ PATH: '/bin', RECORD_VIDEO: 'true' }, 'emulator-5556');
    assert.equal(env.CI, 'true');
    assert.equal(env.ANDROID_UDID, 'emulator-5556');
    assert.equal(env.RECORD_VIDEO, 'false');
    assert.equal(env.PATH, '/bin');
  });
});
