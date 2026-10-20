// Controle do emulador Android: listar AVDs, ligar, esperar o boot e desligar.
// Usado pela preparação automática, pela reciclagem e pelo modo ci:local.
import { spawn, spawnSync } from 'node:child_process';
import { adb, adbPath, emulatorPath } from './android.mjs';

export function listAvds() {
  const result = spawnSync(emulatorPath(), ['-list-avds'], { encoding: 'utf8', timeout: 20_000 });
  return (result.stdout || '').split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('INFO'));
}

/** AVD pedido (se existir) ou o primeiro da lista. */
export function pickAvd(available, preferred) {
  if (preferred) return available.includes(preferred) ? preferred : null;
  return available[0] ?? null;
}

/**
 * Opções de linha de comando. `headless` repete o emulador da CI (sem janela e,
 * sem `gpu`, com renderização por software); o padrão abre com janela e GPU.
 */
export function emulatorArgs({ avd, port, headless = false, gpu = !headless }) {
  const args = ['-avd', avd];
  if (port) args.push('-port', String(port));
  if (headless) args.push('-no-window', '-no-snapshot-save', '-noaudio', '-no-boot-anim', '-camera-back', 'none');
  // Sem GPU, o Vulkan por software deixa a renderização lenta a ponto de o app
  // parecer travado para o Appium; desligado, o emulador fica estável.
  if (gpu) args.push('-gpu', 'host');
  else args.push('-gpu', 'swiftshader_indirect', '-feature', '-Vulkan');
  return args;
}

/** Liga o emulador desacoplado do processo atual (ele continua de pé depois). */
export function startEmulator(options) {
  const child = spawn(emulatorPath(), emulatorArgs(options), { stdio: 'ignore', detached: true });
  child.unref();
  return child;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Espera o Android terminar de iniciar (sys.boot_completed = 1). */
export async function waitForBoot(serial, timeoutMs = 600_000) {
  adb(['-s', serial, 'wait-for-device'], { timeout: timeoutMs });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (adb(['-s', serial, 'shell', 'getprop', 'sys.boot_completed'], { timeout: 10_000 }).stdout === '1') return true;
    await sleep(3_000);
  }
  return false;
}

export function disableAnimations(serial) {
  for (const key of ['window_animation_scale', 'transition_animation_scale', 'animator_duration_scale']) {
    adb(['-s', serial, 'shell', 'settings', 'put', 'global', key, '0']);
  }
}

/** Nome do AVD por trás de um serial de emulador (null se não for emulador). */
export function avdNameOf(serial) {
  if (!/^emulator-\d+$/.test(serial)) return null;
  const { ok, stdout } = adb(['-s', serial, 'emu', 'avd', 'name'], { timeout: 10_000 });
  return ok ? stdout.split(/\r?\n/)[0].trim() || null : null;
}

export async function killEmulator(serial, waitMs = 60_000) {
  spawnSync(adbPath(), ['-s', serial, 'emu', 'kill'], { timeout: 15_000 });
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    if (!adb(['devices']).stdout.includes(serial)) return true;
    await sleep(2_000);
  }
  return false;
}

export const portOf = (serial) => Number(/^emulator-(\d+)$/.exec(serial)?.[1]) || null;
