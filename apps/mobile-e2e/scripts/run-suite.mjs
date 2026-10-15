// Executa uma suíte definida em suites.json: `node scripts/run-suite.mjs smoke`.
// Enquanto a suíte roda, um vigia confere se o device continua respondendo e
// encerra tudo na hora se o emulador cair (sai com código 3).
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { resolveFromWorkspace, resolvePackageBin, WORKSPACE_DIR } from './lib/paths.mjs';
import { adb, firstOnlineDevice } from './lib/android.mjs';
import { createWatchdog, downMessage } from './lib/watchdog.mjs';

const EXIT_DEVICE_DOWN = 3;
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
const child = spawn(process.execPath, [wdioBin, 'run', './wdio.conf.ts', ...specArgs], {
  cwd: WORKSPACE_DIR,
  stdio: 'inherit',
  env: { ...process.env, TEST_SUITE: suiteName },
  detached: process.platform !== 'win32',
});

const serial = process.env.ANDROID_UDID || firstOnlineDevice();
const watchdog = serial
  ? createWatchdog({
      probe: () => adb(['-s', serial, 'get-state'], { timeout: 10_000 }).stdout === 'device',
      onDown: () => {
        console.error(downMessage(serial));
        killTree(child);
      },
    })
  : null;
if (watchdog) watchdog.start(Number(process.env.WATCHDOG_INTERVAL_MS) || 15_000);
else console.warn('[watchdog] nenhum device online para vigiar; seguindo sem o vigia.');

child.on('close', (code) => {
  watchdog?.stop();
  process.exit(watchdog?.isDown() ? EXIT_DEVICE_DOWN : code ?? 1);
});

function killTree(proc) {
  if (!proc.pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  try {
    process.kill(-proc.pid, 'SIGTERM');
  } catch {
    proc.kill('SIGTERM');
  }
}
