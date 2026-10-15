// Instala o driver UiAutomator2 no APPIUM_HOME do workspace, só se ainda não existir.
import { spawnSync } from 'node:child_process';
import { APPIUM_HOME, resolvePackageBin } from './lib/paths.mjs';

const DRIVER = 'uiautomator2';
const appiumMain = resolvePackageBin('appium');

function appium(args, options = {}) {
  return spawnSync(process.execPath, [appiumMain, ...args], {
    env: { ...process.env, APPIUM_HOME },
    encoding: 'utf8',
    ...options,
  });
}

const listed = appium(['driver', 'list', '--installed', '--json']);
const installed = (() => {
  try {
    return JSON.parse(listed.stdout || '{}');
  } catch {
    return {};
  }
})();

if (installed[DRIVER]) {
  console.log(`[appium] driver ${DRIVER} ${installed[DRIVER].version} já instalado em ${APPIUM_HOME}`);
  process.exit(0);
}

console.log(`[appium] instalando driver ${DRIVER} em ${APPIUM_HOME}...`);
const result = appium(['driver', 'install', DRIVER], { stdio: 'inherit' });
process.exit(result.status ?? 1);
