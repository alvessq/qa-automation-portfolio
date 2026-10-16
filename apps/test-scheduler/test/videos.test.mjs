import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createVideos, isVideoName } from '../src/videos.mjs';
import { createDeviceStatus, parseDevices } from '../src/device.mjs';

function workspace() {
  const appsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apps-'));
  const dir = path.join(appsDir, 'data');
  return { appsDir, dir, videos: createVideos({ dir, appsDir }) };
}

function writeVideo(appsDir, relative, mtime) {
  const file = path.join(appsDir, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'v');
  fs.utimesSync(file, mtime, mtime);
}

describe('vídeos das execuções', () => {
  const job = { id: 'web-spec-cart', workspace: 'web-e2e' };

  it('copia o vídeo gerado durante a execução, ignorando os antigos', () => {
    const { appsDir, videos } = workspace();
    const startedAt = new Date('2026-10-15T10:00:00Z');
    writeVideo(appsDir, 'web-e2e/test-results/artifacts/antigo/video.webm', new Date('2026-10-15T09:00:00Z'));
    assert.equal(videos.collect(job, { startedAt: startedAt.toISOString() }), null);
    writeVideo(appsDir, 'web-e2e/test-results/artifacts/carrinho/video.webm', new Date('2026-10-15T10:02:00Z'));
    const name = videos.collect(job, { startedAt: startedAt.toISOString() });
    assert.equal(name, 'web-spec-cart__2026-10-15T10-00-00-000Z.webm');
    assert.ok(videos.pathOf(name));
  });

  it('guarda os 3 mais recentes de cada job', () => {
    const { appsDir, videos } = workspace();
    for (let hour = 10; hour < 15; hour++) {
      const startedAt = new Date(`2026-10-15T${hour}:00:00Z`);
      writeVideo(appsDir, `mobile-e2e/test-results/videos/${hour}_login.mp4`, new Date(startedAt.getTime() + 60_000));
      videos.collect({ id: 'mobile-spec-login', workspace: 'mobile-e2e' }, { startedAt: startedAt.toISOString() });
    }
    assert.deepEqual(videos.list().map((v) => /T(\d\d)/.exec(v.name)[1]), ['14', '13', '12']);
  });

  it('só serve nomes no formato gerado aqui', () => {
    const { videos } = workspace();
    assert.equal(isVideoName('../config.json'), false);
    assert.equal(videos.pathOf('..%2Fconfig.json'), null);
    assert.equal(isVideoName('web-test__2026-10-15T10-00-00-000Z.webm'), true);
  });
});

describe('status do emulador', () => {
  it('lê os devices online e guarda em cache', () => {
    let calls = 0;
    let clock = 0;
    const status = createDeviceStatus({
      env: {},
      run: () => (calls++, { status: 0, stdout: 'List of devices attached\nemulator-5554\tdevice\nemulator-5556\toffline\n' }),
      now: () => clock,
    });
    assert.deepEqual(status(), { online: true, serials: ['emulator-5554'], reason: null });
    clock = 4000;
    status();
    assert.equal(calls, 1);
  });

  it('sem adb explica o motivo', () => {
    const status = createDeviceStatus({ env: {}, run: () => ({ error: new Error('ENOENT') }) });
    assert.equal(status().online, false);
    assert.match(status().reason, /adb não encontrado/);
    assert.deepEqual(parseDevices(''), []);
  });
});
