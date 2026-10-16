import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createProbes, runProbes } from './lib/health-probes.mjs';

const probes = (overrides = {}) =>
  createProbes({
    onlineDevices: () => ['emulator-5554'],
    apkPath: '/apps/my-demo-app.apk',
    driverDir: '/appium/driver',
    exists: () => true,
    ...overrides,
  });

describe('health do mobile', () => {
  it('passa quando o celular, o APK e o driver estão prontos', () => {
    const results = runProbes(probes());
    assert.deepEqual(results.map((r) => [r.name, r.ok]), [['device', true], ['apk', true], ['driver', true]]);
    assert.equal(results[1].detail, 'my-demo-app.apk');
  });

  it('cada conferência falha sozinha, com o motivo', () => {
    const results = runProbes(probes({ onlineDevices: () => [], exists: (p) => p.includes('appium') }));
    assert.deepEqual(results.map((r) => r.ok), [false, false, true]);
    assert.match(results[0].detail, /nenhum device/);
    assert.match(results[1].detail, /apk:download/);
  });

  it('confere o ANDROID_UDID pedido', () => {
    const [device] = runProbes(probes({ wantedUdid: 'emulator-5556' }), ['device']);
    assert.equal(device.ok, false);
    assert.match(device.detail, /emulator-5556 não está online/);
  });

  it('recusa conferência desconhecida', () => {
    assert.throws(() => runProbes(probes(), ['api']), /desconhecida: api/);
  });
});
