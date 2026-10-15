import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { diagnose, summarize } from '../src/env-doctor.mjs';

const find = (report, name) => report.find((item) => item.names.includes(name));

describe('diagnose', () => {
  it('marca ok, ausente e incompleto sem devolver valores', () => {
    const report = diagnose({
      'web-e2e': { BASE_URL: 'https://segredo.example' },
      'mobile-e2e': {},
      'test-scheduler': { GITHUB_REPOSITORY: 'o/r', PANEL_USER: 'a', PANEL_PASSWORD: 'b' },
    });
    assert.equal(find(report, 'BASE_URL').status, 'ok');
    assert.equal(find(report, 'GITHUB_TOKEN').status, 'partial');
    assert.equal(find(report, 'TRIAGE_WEBHOOK_URL').status, 'missing');
    assert.equal(find(report, 'PANEL_USER').status, 'ok');
    assert.doesNotMatch(JSON.stringify(report), /segredo|o\/r/);
  });

  it('aceita qualquer uma das alternativas do Android SDK', () => {
    const report = diagnose({ 'mobile-e2e': { ANDROID_SDK_ROOT: '/sdk' } });
    assert.equal(find(report, 'ANDROID_HOME').status, 'ok');
  });

  it('trata texto em branco como ausente', () => {
    const report = diagnose({ 'test-scheduler': { TRIAGE_WEBHOOK_URL: '   ' } });
    assert.equal(find(report, 'TRIAGE_WEBHOOK_URL').status, 'missing');
  });
});

describe('summarize', () => {
  it('lista só recursos desligados, sem os que têm padrão', () => {
    const lines = summarize(diagnose({ 'web-e2e': {}, 'mobile-e2e': {}, 'test-scheduler': {} }));
    assert.ok(lines.some((l) => l.includes('GITHUB_REPOSITORY + GITHUB_TOKEN ausente')));
    assert.ok(lines.some((l) => l.includes('ANDROID_HOME / ANDROID_SDK_ROOT ausente')));
    assert.ok(lines.every((l) => !l.includes('BASE_URL')));
  });
});
