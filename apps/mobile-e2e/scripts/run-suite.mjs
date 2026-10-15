// Executa uma suíte definida em suites.json: `node scripts/run-suite.mjs smoke`.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolveFromWorkspace, resolvePackageBin, WORKSPACE_DIR } from './lib/paths.mjs';

const suiteName = process.argv[2];
const suites = JSON.parse(fs.readFileSync(resolveFromWorkspace('suites.json'), 'utf8'));

if (!suiteName || !suites[suiteName]) {
  console.error(`Uso: node scripts/run-suite.mjs <${Object.keys(suites).join('|')}>`);
  process.exit(1);
}

const specArgs = suites[suiteName].flatMap((name) => {
  const spec = `./test/specs/${name}.spec.ts`;
  if (!fs.existsSync(resolveFromWorkspace(spec))) {
    console.error(`[suite] spec inexistente em suites.json: ${spec}`);
    process.exit(1);
  }
  return ['--spec', spec];
});

const wdioBin = resolvePackageBin('@wdio/cli', 'wdio');

console.log(`[suite] ${suiteName}: ${suites[suiteName].join(', ')}`);
const result = spawnSync(process.execPath, [wdioBin, 'run', './wdio.conf.ts', ...specArgs], {
  cwd: WORKSPACE_DIR,
  stdio: 'inherit',
  env: { ...process.env, TEST_SUITE: suiteName },
});
process.exit(result.status ?? 1);
