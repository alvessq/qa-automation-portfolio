// Produtos do painel e o catálogo de automações prontas de cada um. O botão
// "Novo" do painel oferece estas automações agrupadas em Suítes, Testes e
// Health checks; tudo sai dos scripts que existem no package.json do workspace.
import fs from 'node:fs';
import path from 'node:path';
import { parseSpec } from './test-catalog.mjs';
import { HEALTH_LABELS } from './health-labels.mjs';

export const PRODUCTS = {
  mobile: { id: 'mobile', name: 'Mobile', workspace: 'mobile-e2e', specsDir: 'test/specs' },
  web: { id: 'web', name: 'Web', workspace: 'web-e2e', specsDir: 'tests' },
};

const SUITES = {
  mobile: { 'suite:smoke': 'Smoke', 'suite:regression': 'Regressão' },
  web: { 'test:smoke': 'Smoke', test: 'Regressão completa' },
};

const DEFAULTS = {
  suite: { intervalMinutes: 360, timeoutMinutes: 40, triage: true },
  test: { intervalMinutes: 120, timeoutMinutes: 20, triage: true },
  health: { intervalMinutes: 5, timeoutMinutes: 2, triage: false },
};

export function productOfWorkspace(workspace) {
  return Object.values(PRODUCTS).find((p) => p.workspace === workspace)?.id ?? null;
}

/** health:* é health check; suítes conhecidas são suíte; o resto é teste. */
export function kindOf(job) {
  if (/^health(:|$)/.test(job.script)) return 'health';
  const product = productOfWorkspace(job.workspace);
  return SUITES[product]?.[job.script] ? 'suite' : 'test';
}

export function healthHint(job) {
  const probe = /^health:(.+)$/.exec(job.script)?.[1];
  const product = productOfWorkspace(job.workspace);
  return probe ? HEALTH_LABELS[product]?.[probe]?.[1] ?? null : 'todas as conferências';
}

function specName(appsDir, product, spec) {
  const { workspace, specsDir } = PRODUCTS[product];
  const file = path.join(appsDir, workspace, specsDir, `${spec}.spec.ts`);
  if (!fs.existsSync(file)) return spec;
  return parseSpec(fs.readFileSync(file, 'utf8')).feature ?? spec;
}

/**
 * Automações prontas de um produto. `id` é estável (`mobile-spec-login`),
 * para o painel saber quais já estão na lista.
 */
export function presetsFor(product, appsDir, availableScripts) {
  const { workspace } = PRODUCTS[product];
  const scripts = availableScripts[workspace] ?? [];
  const presets = [];
  const add = (kind, script, name) => {
    if (!scripts.includes(script)) return;
    const slug = script.replace(/[^a-z0-9]+/g, '-');
    presets.push({ id: `${product}-${slug}`, kind, name, workspace, script, ...DEFAULTS[kind] });
  };
  for (const [script, name] of Object.entries(SUITES[product])) add('suite', script, name);
  for (const script of scripts.filter((s) => s.startsWith('spec:'))) add('test', script, specName(appsDir, product, script.slice(5)));
  for (const [probe, [name]] of Object.entries(HEALTH_LABELS[product])) add('health', `health:${probe}`, name);
  return presets;
}

/** Specs que podem entrar numa suíte do mobile, com o nome da funcionalidade. */
export function mobileSpecs(appsDir) {
  const dir = path.join(appsDir, 'mobile-e2e', PRODUCTS.mobile.specsDir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.spec.ts'))
    .map((f) => f.replace(/\.spec\.ts$/, ''))
    .sort()
    .map((id) => ({ id, name: specName(appsDir, 'mobile', id) }));
}

const SUITE_NAMES = ['smoke', 'regression'];

export function readSuites(appsDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(appsDir, 'mobile-e2e', 'suites.json'), 'utf8'));
  } catch {
    return { smoke: [], regression: [] };
  }
}

/** Atualiza as specs de smoke e/ou regressão em suites.json. Devolve { suites } ou { error }. */
export function writeSuites(appsDir, changes) {
  const known = new Set(mobileSpecs(appsDir).map((s) => s.id));
  const suites = readSuites(appsDir);
  for (const [name, specs] of Object.entries(changes ?? {})) {
    if (!SUITE_NAMES.includes(name)) return { error: `suíte desconhecida: ${name}` };
    if (!Array.isArray(specs) || !specs.length) return { error: `${name} precisa de pelo menos um teste` };
    const unknown = specs.filter((s) => !known.has(s));
    if (unknown.length) return { error: `spec inexistente: ${unknown.join(', ')}` };
    suites[name] = [...new Set(specs)];
  }
  fs.writeFileSync(path.join(appsDir, 'mobile-e2e', 'suites.json'), `${JSON.stringify(suites, null, 2)}\n`);
  return { suites };
}
