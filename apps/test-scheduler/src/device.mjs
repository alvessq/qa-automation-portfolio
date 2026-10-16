// "Emulador on/off" do painel: pergunta ao adb quais devices estão online.
// A resposta fica em cache por alguns segundos porque o painel consulta direto.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function parseDevices(output = '') {
  return output
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter(([serial, state]) => serial && state === 'device')
    .map(([serial]) => serial);
}

function adbBinary(env) {
  const sdk = env.ANDROID_HOME || env.ANDROID_SDK_ROOT;
  const name = process.platform === 'win32' ? 'adb.exe' : 'adb';
  const full = sdk ? path.join(sdk, 'platform-tools', name) : '';
  return full && fs.existsSync(full) ? full : 'adb';
}

export function createDeviceStatus({ env = process.env, run = spawnSync, cacheMs = 5000, now = () => Date.now() } = {}) {
  let cached = null;
  return function status() {
    if (cached && now() - cached.at < cacheMs) return cached.value;
    const result = run(adbBinary(env), ['devices'], { encoding: 'utf8', timeout: 5000 });
    let value;
    if (result.error || result.status !== 0) value = { online: false, serials: [], reason: 'adb não encontrado: confira o ANDROID_HOME.' };
    else {
      const serials = parseDevices(result.stdout);
      value = { online: serials.length > 0, serials, reason: serials.length ? null : 'adb sem device online.' };
    }
    cached = { at: now(), value };
    return value;
  };
}
