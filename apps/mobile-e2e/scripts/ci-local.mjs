// Reproduz no computador as condições do runner da CI: emulador sem janela e
// sem GPU (renderização por software), timeouts e nova tentativa de CI e vídeo
// desligado. Falha que só acontece na CI costuma vir daí, e investigar aqui não
// gasta minutos do GitHub Actions.
//
//   npm run ci:local -w mobile-e2e                 smoke, como na CI
//   npm run ci:local -w mobile-e2e -- regression   outra suíte
//   npm run ci:local -w mobile-e2e -- smoke --gpu  mesma coisa com GPU, para comparar
//
// Usa uma porta própria (5556) para conviver com o emulador que você já usa.
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { adb, adbPath, emulatorPath } from './lib/android.mjs';
import { WORKSPACE_DIR } from './lib/paths.mjs';

export const DEFAULT_PORT = 5556;

export function parseArgs(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  return {
    suite: argv.find((a) => !a.startsWith('--')) ?? 'smoke',
    gpu: flags.has('--gpu'),
    keep: flags.has('--keep'),
  };
}

/** Mesmas opções do emulador da CI (mobile-e2e.yml), trocando só a GPU quando pedido. */
export function emulatorArgs({ avd, port = DEFAULT_PORT, gpu = false }) {
  return [
    '-avd', avd,
    '-port', String(port),
    '-no-window',
    '-gpu', gpu ? 'host' : 'swiftshader_indirect',
    '-no-snapshot-save',
    '-noaudio',
    '-no-boot-anim',
    '-camera-back', 'none',
  ];
}

/** AVD escolhido em CI_LOCAL_AVD ou o primeiro da lista. */
export function pickAvd(available, preferred) {
  if (preferred) return available.includes(preferred) ? preferred : null;
  return available[0] ?? null;
}

export function ciEnv(base, serial) {
  return { ...base, CI: 'true', ANDROID_UDID: serial, ANDROID_DEVICE_NAME: serial, RECORD_VIDEO: 'false' };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForBoot(serial, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (adb(['-s', serial, 'shell', 'getprop', 'sys.boot_completed'], { timeout: 10_000 }).stdout === '1') return true;
    await sleep(5_000);
  }
  return false;
}

async function main() {
  const { suite, gpu, keep } = parseArgs(process.argv.slice(2));
  const list = spawnSync(emulatorPath(), ['-list-avds'], { encoding: 'utf8' });
  const avds = (list.stdout || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const avd = pickAvd(avds, process.env.CI_LOCAL_AVD);
  if (!avd) {
    console.error(`[ci-local] nenhum AVD ${process.env.CI_LOCAL_AVD ? `chamado "${process.env.CI_LOCAL_AVD}"` : 'encontrado'}. Crie um no Android Studio (Device Manager).`);
    process.exit(1);
  }

  const port = Number(process.env.CI_LOCAL_PORT) || DEFAULT_PORT;
  const serial = `emulator-${port}`;
  console.log(`[ci-local] subindo ${avd} em ${serial} ${gpu ? 'com GPU' : 'sem GPU, como na CI'}…`);
  const emulator = spawn(emulatorPath(), emulatorArgs({ avd, port, gpu }), { stdio: 'ignore', detached: process.platform !== 'win32' });

  const shutdown = () => {
    if (keep) return;
    spawnSync(adbPath(), ['-s', serial, 'emu', 'kill'], { timeout: 15_000 });
    emulator.kill();
  };
  process.on('SIGINT', () => {
    shutdown();
    process.exit(130);
  });

  adb(['-s', serial, 'wait-for-device'], { timeout: 300_000 });
  if (!(await waitForBoot(serial, 600_000))) {
    console.error('[ci-local] o emulador não terminou de iniciar em 10 minutos.');
    shutdown();
    process.exit(1);
  }
  for (const key of ['window_animation_scale', 'transition_animation_scale', 'animator_duration_scale']) {
    adb(['-s', serial, 'shell', 'settings', 'put', 'global', key, '0']);
  }

  console.log(`[ci-local] emulador pronto. Rodando a suíte ${suite} com as configurações da CI.`);
  const run = spawnSync(process.execPath, ['scripts/run-suite.mjs', suite], {
    cwd: WORKSPACE_DIR,
    stdio: 'inherit',
    env: ciEnv(process.env, serial),
  });
  shutdown();
  process.exit(run.status ?? 1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
