import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCloudSchedule, validateCloudJob } from '../src/cloud-schedule.mjs';

const base = { id: 'nuvem-smoke', name: 'Smoke', cron: '0 */6 * * *', workflow: 'mobile-e2e.yml', inputs: { suite: 'smoke' } };

function setup({ idleAfter = 0, failDispatch = false, paused = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-'));
  const file = path.join(dir, 'cloud-schedule.json');
  fs.writeFileSync(file, JSON.stringify({ jobs: [{ ...base, enabled: true, order: 10 }, { ...base, id: 'nuvem-reg', name: 'Regressão', inputs: { suite: 'regression' }, enabled: false, order: 20 }] }));
  const scheduled = [];
  const dispatched = [];
  let checks = 0;
  const actions = {
    dispatch: async (workflow, inputs) => {
      if (failDispatch) throw new Error('sem token');
      dispatched.push(inputs.suite);
    },
    isIdle: async () => ++checks > idleAfter,
  };
  const cloud = createCloudSchedule({
    file,
    actions,
    timeZone: 'America/Sao_Paulo',
    isPaused: () => paused,
    schedule: (expr, fn) => {
      scheduled.push({ expr, fn });
      return { stop() {} };
    },
    wait: async () => {},
    log: () => {},
  });
  return { cloud, file, scheduled, dispatched };
}

describe('validateCloudJob', () => {
  it('aceita cron de 5 campos e inputs do workflow', () => {
    const { job } = validateCloudJob({ ...base, enabled: true });
    assert.deepEqual(job, { ...base, enabled: true, order: 0 });
  });

  it('recusa cron inválido, workflow desconhecido e input fora da lista', () => {
    assert.match(validateCloudJob({ ...base, cron: '* * *' }).errors.join(), /cron inválido/);
    assert.match(validateCloudJob({ ...base, cron: '99 * * * *' }).errors.join(), /cron inválido/);
    assert.match(validateCloudJob({ ...base, workflow: 'deploy.yml' }).errors.join(), /workflow deve ser/);
    assert.match(validateCloudJob({ ...base, inputs: { suite: 'tudo' } }).errors.join(), /suite deve ser/);
  });
});

describe('createCloudSchedule', () => {
  it('agenda só os ativos e o tick respeita a pausa', async () => {
    const { cloud, scheduled, dispatched } = setup({ paused: true });
    assert.deepEqual(scheduled.map((s) => s.expr), ['0 */6 * * *']);
    scheduled[0].fn();
    await cloud.drained();
    assert.deepEqual(dispatched, []);
  });

  it('a fila dispara um de cada vez, esperando a execução anterior terminar', async () => {
    const { cloud, dispatched } = setup({ idleAfter: 2 });
    cloud.enqueue('nuvem-smoke');
    assert.deepEqual(cloud.enqueue('nuvem-smoke'), { queued: false, reason: 'já está na fila' });
    cloud.enqueue('nuvem-reg');
    assert.equal(cloud.state().queue.length, 2);
    await cloud.drained();
    assert.deepEqual(dispatched, ['smoke', 'regression']);
    assert.deepEqual(cloud.state().history.map((h) => h.status), ['dispatched', 'dispatched']);
  });

  it('falha no disparo vai para o histórico e não trava a fila', async () => {
    const { cloud } = setup({ failDispatch: true });
    cloud.enqueue('nuvem-smoke');
    await cloud.drained();
    assert.equal(cloud.state().history[0].status, 'failed');
    assert.equal(cloud.state().history[0].error, 'sem token');
    assert.equal(cloud.state().queue.length, 0);
  });

  it('criar, alternar, reordenar e excluir persistem no arquivo', () => {
    const { cloud, file, scheduled } = setup();
    assert.ok(cloud.save({ ...base, id: 'nuvem-login', name: 'Login', inputs: { suite: 'spec', specName: 'login' }, order: 30 }, { create: true }).job);
    assert.match(cloud.save({ ...base }, { create: true }).errors.join(), /já existe/);
    assert.equal(cloud.save({ ...base, id: 'nao-existe' }).notFound, true);
    assert.equal(cloud.toggle('nuvem-reg').enabled, true);
    assert.equal(scheduled.length, 1 + 1 + 2, 'reagenda a cada mudança, só com os ativos');
    assert.equal(cloud.reorder(['nuvem-login', 'nuvem-smoke']), false, 'precisa da lista completa');
    assert.ok(cloud.reorder(['nuvem-login', 'nuvem-reg', 'nuvem-smoke']));
    assert.ok(cloud.remove('nuvem-reg'));
    const saved = JSON.parse(fs.readFileSync(file, 'utf8')).jobs.map((j) => j.id);
    assert.deepEqual(saved, ['nuvem-login', 'nuvem-smoke']);
  });
});
