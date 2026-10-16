// Executa uma suíte de suites.json ou uma spec avulsa:
//   node scripts/run-suite.mjs smoke
//   node scripts/run-suite.mjs spec:login
// Antes, confere o ambiente (doctor) e reinicia o emulador local a cada N
// execuções. Enquanto roda, um vigia confere se o device continua respondendo
// e encerra tudo na hora se o emulador cair (sai com código 3).
import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { resolveFromWorkspace, resolvePackageBin, WORKSPACE_DIR } from './lib/paths.mjs';
import { adb, firstOnlineDevice } from './lib/android.mjs';
import { createWatchdog, downMessage } from './lib/watchdog.mjs';
import { avdNameOf, disableAnimations, killEmulator, portOf, startEmulator, waitForBoot } from './lib/emulator.mjs';
import { createCounter, decideRecycle, DEFAULT_EVERY } from './lib/recycle.mjs';

const EXIT_DEVICE_DOWN = 3;
const target = process.argv[2] ?? '';
const suites = JSON.parse(fs.readFileSync(resolveFromWorkspace('suites.json'), 'utf8'));
const singleSpec = /^spec:([a-z-]+)$/.exec(target)?.[1];
const specNames = singleSpec ? [singleSpec] : suites[target];

if (!specNames) {
  console.error(`Uso: node scripts/run-suite.mjs <${Object.keys(suites).join('|')}|spec:NOME>`);
  process.exit(1);
}

const doctor = spawnSync(process.execPath, [resolveFromWorkspace('scripts/doctor.mjs')], { cwd: WORKSPACE_DIR, stdio: 'inherit' });
if (doctor.status !== 0) process.exit(doctor.status ?? 1);

const specArgs = specNames.flatMap((name) => {
  const spec = `./test/specs/${name}.spec.ts`;
  if (!fs.existsSync(resolveFromWorkspace(spec))) {
    console.error(`[suite] spec inexistente em suites.json: ${spec}`);
    process.exit(1);
  }
  return ['--spec', spec];
});

const wdioBin = resolvePackageBin('@wdio/cli', 'wdio');
const serial = process.env.ANDROID_UDID || firstOnlineDevice();

if (serial) await recycleIfDue(serial);

console.log(`[suite] ${target}: ${specNames.join(', ')}`);
const child = spawn(process.execPath, [wdioBin, 'run', './wdio.conf.ts', ...specArgs], {
  cwd: WORKSPACE_DIR,
  stdio: 'inherit',
  env: { ...process.env, TEST_SUITE: target },
  detached: process.platform !== 'win32',
});

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

/** Reinicia o emulador local a cada N suítes, sem apagar os dados (ver lib/recycle.mjs). */
async function recycleIfDue(device) {
  const counter = createCounter();
  const decision = decideRecycle({
    enabled: process.env.EMULATOR_RECYCLE !== 'false',
    ci: process.env.CI === 'true',
    isEmulator: /^emulator-\d+$/.test(device),
    count: counter.get(device),
    every: Number(process.env.EMULATOR_RECYCLE_EVERY ?? DEFAULT_EVERY),
  });
  if (decision.action === 'skip') return;
  if (decision.action === 'keep') {
    counter.increment(device);
    return;
  }
  const avd = avdNameOf(device);
  if (!avd) {
    console.warn(`[reciclagem] não consegui descobrir o AVD de ${device}; seguindo sem reiniciar.`);
    return;
  }
  console.log(`[reciclagem] ${decision.reason}: reiniciando ${avd} em ${device}…`);
  await killEmulator(device);
  startEmulator({ avd, port: portOf(device) });
  if (!(await waitForBoot(device))) {
    console.error(`[reciclagem] ${device}: device offline — o emulador não voltou depois do reinício.`);
    process.exit(EXIT_DEVICE_DOWN);
  }
  disableAnimations(device);
  counter.reset(device);
  counter.increment(device);
  console.log(`[reciclagem] ${avd} pronto de novo.`);
}

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
