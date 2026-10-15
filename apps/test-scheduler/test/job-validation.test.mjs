import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateJob } from '../src/job-validation.mjs';

const scripts = { 'web-e2e': ['test', 'health'], 'mobile-e2e': ['suite:smoke'] };
const valid = {
  id: 'web-health',
  name: 'Health',
  workspace: 'web-e2e',
  script: 'health',
  intervalMinutes: 5,
  window: { from: '08:00', to: '18:00' },
  timeoutMinutes: 2,
};

describe('validateJob', () => {
  it('aceita um job válido e normaliza os campos', () => {
    const { job, errors } = validateJob({ ...valid, enabled: undefined }, scripts);
    assert.equal(errors, undefined);
    assert.equal(job.enabled, true);
    assert.deepEqual(job.window, { from: '08:00', to: '18:00' });
  });

  it('triagem fica desligada a menos que seja pedida explicitamente', () => {
    assert.equal(validateJob(valid, scripts).job.triage, false);
    assert.equal(validateJob({ ...valid, triage: 'sim' }, scripts).job.triage, false);
    assert.equal(validateJob({ ...valid, triage: true }, scripts).job.triage, true);
  });

  it('aceita job sem janela', () => {
    const { job } = validateJob({ ...valid, window: null }, scripts);
    assert.equal(job.window, null);
  });

  it('recusa workspace fora da lista permitida', () => {
    const { errors } = validateJob({ ...valid, workspace: '../../etc' }, scripts);
    assert.match(errors.join(), /workspace deve ser um de/);
  });

  it('recusa script inexistente ou com caracteres de shell', () => {
    for (const script of ['deploy', 'test && rm -rf /', 'test;echo']) {
      const { errors } = validateJob({ ...valid, script }, scripts);
      assert.match(errors.join(), /não existe/, script);
    }
  });

  it('valida intervalo, timeout, id e janela', () => {
    const { errors } = validateJob(
      { ...valid, id: 'X', intervalMinutes: 0, timeoutMinutes: 999, window: { from: '25:00', to: '08:00' } },
      scripts,
    );
    assert.equal(errors.length, 4);
  });
});
