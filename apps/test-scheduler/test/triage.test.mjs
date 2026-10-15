import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTriage, errorSignature, fingerprint, looksLikeEnvironment } from '../src/triage.mjs';

const job = { id: 'web-smoke', name: 'Web · smoke', triage: true };
const fixedNow = () => new Date('2026-10-15T12:00:00Z');
let seq = 0;
const run = (status, trigger = 'schedule', output = 'Error: expect(locator).toBeVisible() failed') => ({
  runId: `run-${++seq}`,
  status,
  trigger,
  output,
});

describe('looksLikeEnvironment', () => {
  it('reconhece device, sessão, rede e navegador ausente', () => {
    for (const output of [
      'error: no devices/emulators found',
      'emulator-5554 offline',
      'WebDriverError: Could not start a new session',
      'connect ECONNREFUSED 127.0.0.1:4723',
      'page.goto: net::ERR_NAME_NOT_RESOLVED at https://www.saucedemo.com',
      "browserType.launch: Executable doesn't exist at /ms-playwright/chromium-1187/chrome",
    ]) {
      assert.equal(looksLikeEnvironment(output), true, output);
    }
  });

  it('não confunde falha de asserção com ambiente', () => {
    assert.equal(looksLikeEnvironment('Error: expect(received).toBe(expected)'), false);
  });
});

describe('errorSignature e fingerprint', () => {
  it('ignoram números que mudam a cada execução', () => {
    const a = 'Running 19 tests\nError: Timeout 5000ms exceeded waiting for #checkout';
    const b = 'Running 19 tests\nError: Timeout 7500ms exceeded waiting for #checkout';
    assert.equal(errorSignature(a), errorSignature(b));
    assert.equal(fingerprint('web-smoke', a), fingerprint('web-smoke', b));
  });

  it('separa falhas diferentes do mesmo job', () => {
    assert.notEqual(fingerprint('web-smoke', 'Error: login falhou'), fingerprint('web-smoke', 'Error: total errado'));
  });

  it('prefere o erro do teste às mensagens genéricas do npm', () => {
    const output = [
      '> web-e2e@1.0.0 health',
      '✖ https://example.com indisponível: HTML sem bundle JavaScript',
      'npm error Lifecycle script `health` failed with error:',
      'npm error code 1',
    ].join('\n');
    assert.equal(errorSignature(output), '✖ https://example.com indisponível: HTML sem bundle JavaScript');
  });

  it('tem um texto padrão quando não há linha de erro', () => {
    assert.equal(errorSignature('tudo silencioso'), 'falha sem mensagem de erro');
  });
});

describe('createTriage', () => {
  it('ignora jobs sem triagem e execuções que passaram', () => {
    const triage = createTriage();
    assert.deepEqual(triage.handle({ ...job, triage: false }, run('failed')), { action: 'none' });
    assert.deepEqual(triage.handle(job, run('passed')), { action: 'none' });
  });

  it('repete 3 vezes e confirma bug quando todas falham', () => {
    const triage = createTriage({ now: fixedNow });
    const origin = run('failed');
    assert.deepEqual(triage.handle(job, origin), { action: 'retry', attempt: 1 });
    assert.deepEqual(triage.handle(job, run('failed', 'triagem')), { action: 'retry', attempt: 2 });
    assert.deepEqual(triage.handle(job, run('timeout', 'triagem')), { action: 'retry', attempt: 3 });

    const step = triage.handle(job, run('failed', 'triagem'));
    assert.equal(step.action, 'verdict');
    assert.equal(step.verdict.kind, 'bug');
    assert.equal(step.verdict.attempts.length, 3);
    assert.equal(step.verdict.origin.runId, origin.runId);
    assert.equal(step.verdict.decidedAt, '2026-10-15T12:00:00.000Z');
    assert.deepEqual(triage.active(), []);
  });

  it('marca falha passageira assim que uma repetição passa', () => {
    const triage = createTriage();
    triage.handle(job, run('failed'));
    triage.handle(job, run('failed', 'triagem'));
    const step = triage.handle(job, run('passed', 'triagem'));
    assert.equal(step.verdict.kind, 'flaky');
    assert.equal(step.verdict.attempts.length, 2);
  });

  it('não repete quando a falha original já é de ambiente', () => {
    const triage = createTriage();
    const step = triage.handle(job, run('failed', 'schedule', 'error: device offline'));
    assert.equal(step.verdict.kind, 'environment');
    assert.equal(step.verdict.attempts.length, 0);
  });

  it('encerra como ambiente quando uma repetição perde o device', () => {
    const triage = createTriage();
    triage.handle(job, run('failed'));
    const step = triage.handle(job, run('failed', 'triagem', 'Could not start a new session'));
    assert.equal(step.verdict.kind, 'environment');
  });

  it('não abre uma segunda sessão para o mesmo job', () => {
    const triage = createTriage();
    triage.handle(job, run('failed'));
    assert.deepEqual(triage.handle(job, run('failed', 'manual')), { action: 'none' });
    assert.equal(triage.active().length, 1);
  });

  it('cancela a sessão quando a repetição é parada', () => {
    const triage = createTriage();
    triage.handle(job, run('failed'));
    assert.deepEqual(triage.handle(job, run('stopped', 'triagem')), { action: 'none' });
    assert.deepEqual(triage.active(), []);
  });

  it('com zero repetições o primeiro erro já é bug', () => {
    const triage = createTriage({ retries: 0 });
    assert.equal(triage.handle(job, run('failed')).verdict.kind, 'bug');
  });

  it('não expõe a saída completa nas sessões ativas', () => {
    const triage = createTriage();
    triage.handle(job, run('failed'));
    const [session] = triage.active();
    assert.equal(session.origin.output, undefined);
    assert.equal(session.retries, 3);
  });
});
