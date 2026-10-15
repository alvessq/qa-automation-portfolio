// Caminhos e consultas ao Android SDK usados pelos scripts (adb e emulador).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const exe = (name) => (process.platform === 'win32' ? `${name}.exe` : name);

export function sdkDir(env = process.env) {
  return env.ANDROID_HOME || env.ANDROID_SDK_ROOT || '';
}

/** Binário do SDK quando existe; senão o nome puro, para cair no PATH. */
function sdkBinary(subdir, name, env) {
  const sdk = sdkDir(env);
  const full = sdk ? path.join(sdk, subdir, exe(name)) : '';
  return full && fs.existsSync(full) ? full : name;
}

export const adbPath = (env = process.env) => sdkBinary('platform-tools', 'adb', env);
export const emulatorPath = (env = process.env) => sdkBinary('emulator', 'emulator', env);

export function adb(args, { timeout = 15_000 } = {}) {
  const result = spawnSync(adbPath(), args, { encoding: 'utf8', timeout });
  return { ok: result.status === 0, stdout: (result.stdout || '').trim(), stderr: (result.stderr || '').trim() };
}

/** Serials com estado "device" na saída de `adb devices`. */
export function parseDevices(output) {
  return output
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter(([serial, state]) => serial && state === 'device')
    .map(([serial]) => serial);
}

export function firstOnlineDevice() {
  const { ok, stdout } = adb(['devices']);
  return ok ? parseDevices(stdout)[0] ?? null : null;
}
