import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { healthHint, kindOf, mobileSpecs, presetsFor, readSuites, writeSuites } from '../src/automations.mjs';
import { loadAvailableScripts } from '../src/job-validation.mjs';

const APPS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('tipo do job', () => {
  it('health, suíte ou teste avulso', () => {
    assert.equal(kindOf({ workspace: 'web-e2e', script: 'health:imagens' }), 'health');
    assert.equal(kindOf({ workspace: 'web-e2e', script: 'test:smoke' }), 'suite');
    assert.equal(kindOf({ workspace: 'mobile-e2e', script: 'suite:regression' }), 'suite');
    assert.equal(kindOf({ workspace: 'mobile-e2e', script: 'spec:cart' }), 'test');
  });

  it('o health diz o que confere', () => {
    assert.equal(healthHint({ workspace: 'mobile-e2e', script: 'health:apk' }), 'o arquivo do My Demo App está baixado');
    assert.equal(healthHint({ workspace: 'web-e2e', script: 'health' }), 'todas as conferências');
  });
});

describe('catálogo com os scripts reais do monorepo', () => {
  const scripts = loadAvailableScripts(APPS_DIR);

  it('traz suítes, testes e health checks de cada produto', () => {
    for (const product of ['mobile', 'web']) {
      const presets = presetsFor(product, APPS_DIR, scripts);
      const kinds = new Set(presets.map((p) => p.kind));
      assert.deepEqual([...kinds].sort(), ['health', 'suite', 'test'], product);
      for (const preset of presets) assert.ok(scripts[preset.workspace].includes(preset.script), preset.script);
    }
  });

  it('o nome do teste vem da funcionalidade da spec', () => {
    const cart = presetsFor('mobile', APPS_DIR, scripts).find((p) => p.script === 'spec:cart');
    assert.deepEqual([cart.id, cart.name, cart.triage], ['mobile-spec-cart', 'Carrinho', true]);
  });

  it('todo job do config.json corresponde a uma automação do catálogo', () => {
    const { jobs } = JSON.parse(fs.readFileSync(path.join(APPS_DIR, 'test-scheduler', 'config.json'), 'utf8'));
    const ids = new Set(['mobile', 'web'].flatMap((p) => presetsFor(p, APPS_DIR, scripts).map((x) => x.id)));
    for (const job of jobs) assert.ok(ids.has(job.id), job.id);
  });
});

describe('suítes do mobile', () => {
  function copyWorkspace() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apps-'));
    fs.cpSync(path.join(APPS_DIR, 'mobile-e2e', 'test', 'specs'), path.join(dir, 'mobile-e2e', 'test', 'specs'), { recursive: true });
    fs.copyFileSync(path.join(APPS_DIR, 'mobile-e2e', 'suites.json'), path.join(dir, 'mobile-e2e', 'suites.json'));
    return dir;
  }

  it('lista as specs com o nome da funcionalidade', () => {
    assert.ok(mobileSpecs(APPS_DIR).some((s) => s.id === 'product-details' && s.name === 'Detalhes do produto'));
  });

  it('grava a escolha e recusa spec inexistente ou suíte vazia', () => {
    const dir = copyWorkspace();
    assert.deepEqual(writeSuites(dir, { smoke: ['login', 'cart', 'login'] }).suites.smoke, ['login', 'cart']);
    assert.deepEqual(readSuites(dir).smoke, ['login', 'cart']);
    assert.match(writeSuites(dir, { smoke: ['pagamento'] }).error, /inexistente: pagamento/);
    assert.match(writeSuites(dir, { regression: [] }).error, /pelo menos um/);
    assert.match(writeSuites(dir, { full: ['login'] }).error, /desconhecida/);
  });
});
