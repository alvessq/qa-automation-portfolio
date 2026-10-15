// Deixa o computador pronto para os testes mobile, sem ninguém precisar lembrar:
//   1. baixa o APK se não existe ou se saiu um release novo (--refresh);
//   2. se nenhum device está online, liga um emulador e espera o boot.
// O agendador chama este script em segundo plano ao abrir o painel.
//
//   npm run prepare:device -w mobile-e2e
//   EMULATOR_AVD=Pixel_6 npm run prepare:device -w mobile-e2e
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { firstOnlineDevice } from './lib/android.mjs';
import { disableAnimations, listAvds, pickAvd, startEmulator, waitForBoot } from './lib/emulator.mjs';
import { WORKSPACE_DIR } from './lib/paths.mjs';

export async function prepare({ log = console.log, env = process.env } = {}) {
  const apk = spawnSync(process.execPath, ['scripts/download-apk.mjs', '--refresh'], { cwd: WORKSPACE_DIR, stdio: 'inherit' });
  if (apk.status !== 0) log('[preparo] não foi possível conferir o APK; seguindo com o que estiver no disco.');

  const online = firstOnlineDevice();
  if (online) {
    log(`[preparo] device já online: ${online}`);
    return { ok: true, device: online, started: false };
  }
  if (env.EMULATOR_AUTOSTART === 'false') {
    log('[preparo] nenhum device online e EMULATOR_AUTOSTART=false: não vou ligar emulador.');
    return { ok: false, device: null, started: false };
  }

  const avd = pickAvd(listAvds(), env.EMULATOR_AVD);
  if (!avd) {
    log('[preparo] nenhum device online e nenhum AVD encontrado. Crie um no Android Studio (Device Manager).');
    return { ok: false, device: null, started: false };
  }
  log(`[preparo] nenhum device online; ligando o emulador ${avd}…`);
  startEmulator({ avd, port: 5554 });
  const serial = 'emulator-5554';
  if (!(await waitForBoot(serial))) {
    log('[preparo] o emulador não terminou de iniciar em 10 minutos.');
    return { ok: false, device: serial, started: true };
  }
  disableAnimations(serial);
  log(`[preparo] ${avd} pronto em ${serial}.`);
  return { ok: true, device: serial, started: true };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { ok } = await prepare();
  process.exit(ok ? 0 : 1);
}
