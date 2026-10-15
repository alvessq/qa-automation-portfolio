// Diagnóstico do ambiente Android antes de rodar os testes.
// Falha cedo, com mensagem clara, em vez de deixar a sessão Appium estourar timeout.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { APPIUM_HOME, resolveFromWorkspace } from './lib/paths.mjs';

if (String(process.env.SKIP_DOCTOR).toLowerCase() === 'true') {
  console.log('[doctor] SKIP_DOCTOR=true — diagnóstico ignorado.');
  process.exit(0);
}

const checks = [];
const check = (name, fn) => checks.push({ name, fn });

check('Java (JDK 17+)', () => {
  const out = run('java', ['-version']);
  if (!out.ok) return fail('java não encontrado no PATH. Instale o JDK 17.');
  const major = Number(/version "(\d+)/.exec(out.text)?.[1]);
  return major >= 17 ? pass(`versão ${major}`) : fail(`JDK ${major} encontrado; use 17 ou superior.`);
});

check('Android SDK', () => {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (!sdk) return fail('defina ANDROID_HOME (ou ANDROID_SDK_ROOT).');
  return fs.existsSync(sdk) ? pass(sdk) : fail(`pasta não existe: ${sdk}`);
});

check('adb', () => (run('adb', ['version']).ok ? pass('ok') : fail('adb não encontrado. Adicione platform-tools ao PATH.')));

check('Device conectado', () => {
  const out = run('adb', ['devices']);
  const devices = out.text
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter(([serial, state]) => serial && state === 'device')
    .map(([serial]) => serial);
  if (!devices.length) return fail('nenhum device/emulador online. Inicie um AVD ou conecte um celular.');
  const wanted = process.env.ANDROID_UDID?.trim();
  if (wanted && !devices.includes(wanted)) return fail(`ANDROID_UDID=${wanted} não está online (online: ${devices.join(', ')}).`);
  return pass(devices.join(', '));
});

check('APK do My Demo App', () => {
  const apk = resolveFromWorkspace(process.env.APP_PATH || './apps/my-demo-app.apk');
  return fs.existsSync(apk) ? pass(path.basename(apk)) : fail(`APK não encontrado em ${apk}. Rode: npm run apk:download`);
});

check('Driver UiAutomator2', () => {
  const driverDir = path.join(APPIUM_HOME, 'node_modules', 'appium-uiautomator2-driver');
  return fs.existsSync(driverDir) ? pass('instalado') : fail('driver ausente. Rode: npm run appium:setup');
});

let failed = 0;
for (const { name, fn } of checks) {
  const result = fn();
  if (!result.ok) failed++;
  console.log(`${result.ok ? '✔' : '✖'} ${name.padEnd(22)} ${result.detail}`);
}

if (failed) {
  console.error(`\n[doctor] ${failed} verificação(ões) falharam. Corrija antes de rodar os testes.`);
  process.exit(1);
}

function run(cmd, args) {
  const res = spawnSync(cmd, args, { encoding: 'utf8' });
  return { ok: res.status === 0, text: `${res.stdout ?? ''}${res.stderr ?? ''}` };
}

function pass(detail) {
  return { ok: true, detail };
}

function fail(detail) {
  return { ok: false, detail };
}
