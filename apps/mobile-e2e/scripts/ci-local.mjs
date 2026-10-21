// Reproduz no computador as condições do runner da CI: emulador sem janela e
// sem GPU (renderização por software), timeouts e nova tentativa de CI e vídeo
// desligado. Falha que só acontece na CI costuma vir daí, e investigar aqui não
// gasta minutos do GitHub Actions.
//
//   npm run ci:local -w mobile-e2e                 smoke, como na CI
//   npm run ci:local -w mobile-e2e -- regression   outra suíte
//   npm run ci:local -w mobile-e2e -- smoke --gpu  mesma coisa com GPU, para comparar
//   npm run ci:local -w mobile-e2e -- --keep       deixa o emulador ligado no fim
//
// Usa uma porta própria (5556) para conviver com o emulador que você já usa.
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { killEmulator, listAvds, pickAvd, startEmulator, waitForBoot } from './lib/emulator.mjs';
import { WORKSPACE_DIR } from './lib/paths.mjs';
import { adb } from './lib/android.mjs';
import { prepareForSuite, resetTuning } from './lib/emulator-health.mjs';

export const DEFAULT_PORT = 5556;

export function parseArgs(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  return {
    suite: argv.find((a) => !a.startsWith('--')) ?? 'smoke',
    gpu: flags.has('--gpu'),
    keep: flags.has('--keep'),
  };
}

export function ciEnv(base, serial) {
  // A reciclagem fica de fora: o emulador do ci:local já nasce e morre com a execução.
  return { ...base, CI: 'true', ANDROID_UDID: serial, ANDROID_DEVICE_NAME: serial, RECORD_VIDEO: 'false', EMULATOR_RECYCLE: 'false' };
}

async function main() {
  const { suite, gpu, keep } = parseArgs(process.argv.slice(2));
  const avd = pickAvd(listAvds(), process.env.CI_LOCAL_AVD || process.env.EMULATOR_AVD);
  if (!avd) {
    console.error('[ci-local] nenhum AVD encontrado. Crie um no Android Studio (Device Manager) ou confira CI_LOCAL_AVD.');
    process.exit(1);
  }

  const port = Number(process.env.CI_LOCAL_PORT) || DEFAULT_PORT;
  const serial = `emulator-${port}`;
  console.log(`[ci-local] subindo ${avd} em ${serial} ${gpu ? 'com GPU' : 'sem GPU, como na CI'}…`);
  startEmulator({ avd, port, headless: true, gpu });

  // Os ajustes de tela da CI ficam gravados no AVD: desfaz antes de sair,
  // para o emulador do dia a dia continuar como estava.
  const shutdown = async () => {
    resetTuning(adb, serial);
    if (!keep) await killEmulator(serial);
  };
  process.on('SIGINT', async () => {
    await shutdown();
    process.exit(130);
  });

  if (!(await waitForBoot(serial))) {
    console.error('[ci-local] o emulador não terminou de iniciar em 10 minutos.');
    await shutdown();
    process.exit(1);
  }
  const preparo = await prepareForSuite(adb, serial, { sleep: (ms) => new Promise((r) => setTimeout(r, ms)), log: console.log });
  if (!preparo.ok) {
    console.error(`[ci-local] ${preparo.reason}`);
    await shutdown();
    process.exit(3);
  }

  console.log(`[ci-local] emulador pronto. Rodando a suíte ${suite} com as configurações da CI.`);
  const run = spawnSync(process.execPath, ['scripts/run-suite.mjs', suite], {
    cwd: WORKSPACE_DIR,
    stdio: 'inherit',
    env: ciEnv(process.env, serial),
  });
  await shutdown();
  process.exit(run.status ?? 1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
