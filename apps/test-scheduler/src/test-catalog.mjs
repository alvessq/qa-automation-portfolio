// "O que este job testa": lê os arquivos de teste e devolve, em português, as
// funcionalidades e os cenários que o script do job executa. Assim quem não lê
// código entende o que passou ou falhou.
import fs from 'node:fs';
import path from 'node:path';

const QUOTED = String.raw`(['"\x60])((?:\\.|(?!\1).)*)\1`;
const FEATURE_RE = new RegExp(String.raw`^\s*(?:test\.)?describe\(\s*${QUOTED}`, 'gm');
const SCENARIO_RE = new RegExp(String.raw`^\s*(?:test|it)\(\s*${QUOTED}(\s*,\s*\{[^}]*tag:\s*\[?\s*['"]([^'"]+)['"])?`, 'gm');

/** Títulos montados em laço (`exige o campo ${field}`) aparecem com reticências. */
const tidy = (title) => title.replace(/\$\{[^}]*\}/g, '…').trim();

export function parseSpec(source) {
  const feature = FEATURE_RE.exec(source);
  FEATURE_RE.lastIndex = 0;
  const scenarios = [...source.matchAll(SCENARIO_RE)].map((m) => ({
    title: tidy(m[2]),
    tags: m[4] ? [m[4]] : [],
  }));
  return { feature: feature ? tidy(feature[2]) : null, scenarios };
}

const HEALTH = [
  {
    feature: 'Saúde do site',
    file: 'scripts/health.mjs',
    scenarios: [
      'a página inicial responde',
      'o aplicativo carrega com o formulário de login',
      'a folha de estilo carrega',
      'o catálogo tem produtos',
      'as imagens dos produtos carregam',
    ].map((title) => ({ title, tags: [] })),
  },
];

function readSpecs(dir, names) {
  if (!fs.existsSync(dir)) return [];
  const files = names
    ? names.map((name) => `${name}.spec.ts`)
    : fs.readdirSync(dir).filter((f) => f.endsWith('.spec.ts')).sort();
  return files
    .filter((file) => fs.existsSync(path.join(dir, file)))
    .map((file) => {
      const { feature, scenarios } = parseSpec(fs.readFileSync(path.join(dir, file), 'utf8'));
      return { feature: feature ?? file, file, scenarios };
    });
}

/**
 * Catálogo do job a partir do comando do script no package.json:
 *   `playwright test --grep @smoke`      → só cenários com a tag
 *   `node scripts/run-suite.mjs smoke`   → specs listadas em suites.json
 *   `node scripts/health.mjs`            → descrição fixa do health check
 */
export function catalogFor(job, appsDir) {
  const workspaceDir = path.join(appsDir, job.workspace);
  const manifest = path.join(workspaceDir, 'package.json');
  if (!fs.existsSync(manifest)) return [];
  const command = JSON.parse(fs.readFileSync(manifest, 'utf8')).scripts?.[job.script] ?? '';

  if (/health/.test(command)) return HEALTH;

  if (job.workspace === 'web-e2e') {
    const specs = readSpecs(path.join(workspaceDir, 'tests'));
    const tag = /--grep\s+(@[\w-]+)/.exec(command)?.[1];
    if (!tag) return specs;
    return specs
      .map((spec) => ({ ...spec, scenarios: spec.scenarios.filter((s) => s.tags.includes(tag)) }))
      .filter((spec) => spec.scenarios.length);
  }

  if (job.workspace === 'mobile-e2e') {
    const suite = /run-suite\.mjs\s+([\w-]+)/.exec(command)?.[1];
    const suitesFile = path.join(workspaceDir, 'suites.json');
    const names = suite && fs.existsSync(suitesFile) ? JSON.parse(fs.readFileSync(suitesFile, 'utf8'))[suite] : null;
    return readSpecs(path.join(workspaceDir, 'test', 'specs'), names);
  }

  return [];
}
