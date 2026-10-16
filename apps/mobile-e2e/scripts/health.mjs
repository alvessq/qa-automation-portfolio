// Health do ambiente mobile, uma conferência por item:
//   npm run health                 todas
//   npm run health -- device apk   só as escolhidas
// Sai com código 1 se alguma falhar, para o agendador e a CI.
import 'dotenv/config';
import path from 'node:path';
import { adb, parseDevices } from './lib/android.mjs';
import { APPIUM_HOME, resolveFromWorkspace } from './lib/paths.mjs';
import { createProbes, runProbes } from './lib/health-probes.mjs';

const probes = createProbes({
  onlineDevices: () => {
    const { ok, stdout } = adb(['devices']);
    return ok ? parseDevices(stdout) : [];
  },
  apkPath: resolveFromWorkspace(process.env.APP_PATH || './apps/my-demo-app.apk'),
  driverDir: path.join(APPIUM_HOME, 'node_modules', 'appium-uiautomator2-driver'),
  wantedUdid: process.env.ANDROID_UDID?.trim(),
});

try {
  const results = runProbes(probes, process.argv.slice(2));
  console.log('Health do ambiente mobile');
  for (const r of results) console.log(`${r.ok ? '✔' : '✖'} ${r.label.padEnd(32)} ${String(r.ms).padStart(5)} ms  ${r.detail}`);
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.error(`✖ ambiente mobile indisponível: ${failed.map((r) => `${r.name} (${r.detail})`).join('; ')}`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`✖ ${error.message}`);
  process.exitCode = 1;
}
