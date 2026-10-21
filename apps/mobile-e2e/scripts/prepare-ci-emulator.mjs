// Prepara o emulador da CI antes da suíte (ver lib/emulator-health.mjs):
// espera o Android ligar, reinicia uma vez se ele não ficar saudável e aplica
// os ajustes de estabilidade. Sai com código 3 (device offline) se não der,
// o mesmo código do vigia, que a triagem reconhece como problema de ambiente.
//
//   node scripts/prepare-ci-emulator.mjs [serial]
import { adb } from './lib/android.mjs';
import { parseDeviceStates, prepareForSuite } from './lib/emulator-health.mjs';

const EXIT_DEVICE_DOWN = 3;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const serial =
  process.argv[2] ||
  process.env.ANDROID_UDID ||
  parseDeviceStates(adb(['devices']).stdout).find((d) => d.serial.startsWith('emulator-'))?.serial;

if (!serial) {
  console.error('[emulador] device offline: nenhum emulador encontrado no adb.');
  process.exit(EXIT_DEVICE_DOWN);
}

const result = await prepareForSuite(adb, serial, { sleep, log: console.log });
if (!result.ok) {
  console.error(`[emulador] ${result.reason}`);
  process.exitCode = EXIT_DEVICE_DOWN;
}
