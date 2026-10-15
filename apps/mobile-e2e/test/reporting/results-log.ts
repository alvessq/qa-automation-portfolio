import fs from 'node:fs';
import path from 'node:path';
import { RESULTS_DIR } from '../config/env';

/**
 * Cada worker do WDIO roda em um processo separado, então os resultados são
 * gravados linha a linha (NDJSON) e consolidados no `onComplete`, que roda no
 * processo do launcher.
 */
const LOG_FILE = path.join(RESULTS_DIR, 'results.ndjson');
const SUMMARY_FILE = path.join(RESULTS_DIR, 'summary.json');

export interface TestResultEntry {
  title: string;
  suite: string;
  passed: boolean;
  durationMs: number;
  error?: string;
  evidence?: string[];
}

export function resetResultsLog(): void {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.rmSync(LOG_FILE, { force: true });
}

export function appendResult(entry: TestResultEntry): void {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.appendFileSync(LOG_FILE, `${JSON.stringify(entry)}\n`);
}

export function writeSummary(exitCode: number): void {
  const entries: TestResultEntry[] = fs.existsSync(LOG_FILE)
    ? fs
        .readFileSync(LOG_FILE, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as TestResultEntry)
    : [];

  const passed = entries.filter((e) => e.passed).length;
  const summary = {
    suite: process.env.TEST_SUITE ?? 'custom',
    finishedAt: new Date().toISOString(),
    exitCode,
    total: entries.length,
    passed,
    failed: entries.length - passed,
    tests: entries,
  };
  fs.writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2));
  console.log(`[report] ${passed}/${entries.length} testes passaram — ${path.relative(process.cwd(), SUMMARY_FILE)}`);

  // No GitHub Actions, o resumo aparece na página da execução.
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, toMarkdown(summary));
  }
}

function toMarkdown(summary: { suite: string; total: number; passed: number; failed: number; tests: TestResultEntry[] }): string {
  const rows = summary.tests
    .map((t) => `| ${t.passed ? '✅' : '❌'} | ${t.suite} | ${t.title} | ${(t.durationMs / 1000).toFixed(1)}s |`)
    .join('\n');
  return [
    `### Mobile E2E — suíte \`${summary.suite}\``,
    '',
    `**${summary.passed}/${summary.total}** passaram${summary.failed ? `, **${summary.failed}** falharam` : ''}.`,
    '',
    '| | Spec | Teste | Duração |',
    '|---|---|---|---|',
    rows,
    '',
  ].join('\n');
}
