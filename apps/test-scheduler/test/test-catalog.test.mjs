import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalogFor, parseSpec } from '../src/test-catalog.mjs';

const APPS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('parseSpec', () => {
  it('lê a funcionalidade, os cenários e a tag', () => {
    const source = [
      "test.describe('Login', () => {",
      "  test('autentica um usuário válido', { tag: '@smoke' }, async () => {});",
      '  test("recusa senha incorreta", async () => {});',
      '  for (const { field } of fields) {',
      '    test(`exige o campo ${field}`, async () => {});',
      '  }',
      '});',
    ].join('\n');
    assert.deepEqual(parseSpec(source), {
      feature: 'Login',
      scenarios: [
        { title: 'autentica um usuário válido', tags: ['@smoke'] },
        { title: 'recusa senha incorreta', tags: [] },
        { title: 'exige o campo …', tags: [] },
      ],
    });
  });

  it('entende o estilo describe/it do WebdriverIO', () => {
    const { feature, scenarios } = parseSpec("describe('Carrinho', () => {\n  it('remove um item', async () => {});\n});");
    assert.equal(feature, 'Carrinho');
    assert.equal(scenarios[0].title, 'remove um item');
  });
});

describe('catalogFor com os testes reais do monorepo', () => {
  it('o smoke web traz só cenários marcados com @smoke', () => {
    const features = catalogFor({ workspace: 'web-e2e', script: 'test:smoke' }, APPS_DIR);
    const scenarios = features.flatMap((f) => f.scenarios);
    assert.ok(scenarios.length > 0);
    assert.ok(scenarios.every((s) => s.tags.includes('@smoke')));
  });

  it('a suíte web completa tem mais cenários que o smoke', () => {
    const count = (script) =>
      catalogFor({ workspace: 'web-e2e', script }, APPS_DIR).reduce((n, f) => n + f.scenarios.length, 0);
    assert.ok(count('test') > count('test:smoke'));
  });

  it('a suíte mobile segue o suites.json', () => {
    const files = catalogFor({ workspace: 'mobile-e2e', script: 'suite:smoke' }, APPS_DIR).map((f) => f.file);
    assert.deepEqual(files, ['catalog.spec.ts', 'login.spec.ts']);
  });

  it('o health check tem uma descrição própria', () => {
    const [feature] = catalogFor({ workspace: 'web-e2e', script: 'health' }, APPS_DIR);
    assert.equal(feature.feature, 'Saúde do site');
    assert.equal(feature.scenarios.length, 5);
  });

  it('cada conferência do health mostra só a si mesma', () => {
    const [web] = catalogFor({ workspace: 'web-e2e', script: 'health:imagens' }, APPS_DIR);
    assert.deepEqual(web.scenarios.map((s) => s.title), ['Imagens dos produtos: a imagem de um produto carrega']);
    const [mobile] = catalogFor({ workspace: 'mobile-e2e', script: 'health:device' }, APPS_DIR);
    assert.equal(mobile.feature, 'Saúde do ambiente mobile');
  });

  it('script de uma spec mostra só aquela spec', () => {
    assert.deepEqual(catalogFor({ workspace: 'web-e2e', script: 'spec:cart' }, APPS_DIR).map((f) => f.file), ['cart.spec.ts']);
    assert.deepEqual(catalogFor({ workspace: 'mobile-e2e', script: 'spec:checkout' }, APPS_DIR).map((f) => f.file), ['checkout.spec.ts']);
  });
});
