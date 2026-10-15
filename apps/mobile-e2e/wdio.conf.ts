import path from 'node:path';
import fs from 'node:fs';
import { APP_PACKAGE, env, isCI, RESULTS_DIR, WORKSPACE_DIR } from './test/config/env';
import { collectEvidence, startVideo } from './test/reporting/evidence';
import { appendResult, resetResultsLog, writeSummary } from './test/reporting/results-log';

// Drivers do Appium ficam no workspace (instalados por `npm run appium:setup`).
process.env.APPIUM_HOME ??= path.join(WORKSPACE_DIR, '.appium');

const appPath = path.resolve(WORKSPACE_DIR, env('APP_PATH', './apps/my-demo-app.apk'));
const udid = env('ANDROID_UDID');
const platformVersion = env('ANDROID_PLATFORM_VERSION');

// Emulador de CI não tem GPU: instalar APK e subir o UiAutomator2 é bem mais lento.
const slowEnvironment = isCI;

export const config: WebdriverIO.Config = {
  runner: 'local',
  tsConfigPath: './tsconfig.json',

  specs: ['./test/specs/**/*.spec.ts'],
  maxInstances: 1,

  capabilities: [
    {
      platformName: 'Android',
      'appium:automationName': 'UiAutomator2',
      'appium:deviceName': env('ANDROID_DEVICE_NAME', 'Android Emulator'),
      ...(udid ? { 'appium:udid': udid } : {}),
      ...(platformVersion ? { 'appium:platformVersion': platformVersion } : {}),
      'appium:app': appPath,
      'appium:appPackage': APP_PACKAGE,
      'appium:appWaitActivity': '*',
      'appium:autoGrantPermissions': true,
      'appium:newCommandTimeout': 240,
      // Estado do app é limpo pelo helper resetApp() antes de cada teste.
      'appium:noReset': false,
      'appium:fullReset': false,
      ...(slowEnvironment
        ? {
            'appium:androidInstallTimeout': 240_000,
            'appium:uiautomator2ServerInstallTimeout': 120_000,
            'appium:uiautomator2ServerLaunchTimeout': 120_000,
            'appium:adbExecTimeout': 120_000,
          }
        : {}),
    },
  ],

  logLevel: isCI ? 'warn' : 'info',
  outputDir: path.join(RESULTS_DIR, 'logs'),
  bail: 0,
  waitforTimeout: slowEnvironment ? 30_000 : 15_000,
  connectionRetryTimeout: slowEnvironment ? 300_000 : 120_000,
  connectionRetryCount: slowEnvironment ? 1 : 2,

  services: [
    [
      'appium',
      {
        logPath: path.join(RESULTS_DIR, 'logs'),
        args: { port: 4723, logTimestamp: true },
      },
    ],
  ],

  framework: 'mocha',
  mochaOpts: {
    ui: 'bdd',
    timeout: slowEnvironment ? 300_000 : 120_000,
    // Uma nova tentativa só na CI, onde o emulador é mais instável.
    retries: isCI ? 1 : 0,
  },

  reporters: [
    'spec',
    [
      'junit',
      {
        outputDir: path.join(RESULTS_DIR, 'junit'),
        outputFileFormat: ({ cid }: { cid: string }) => `mobile-${cid}.xml`,
      },
    ],
  ],

  onPrepare() {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    resetResultsLog();
  },

  async beforeTest() {
    await startVideo();
  },

  async afterTest(test, _context, result) {
    const evidence = await collectEvidence(`${test.parent} ${test.title}`, result.passed);
    appendResult({
      title: test.title,
      suite: test.parent,
      passed: result.passed,
      durationMs: result.duration,
      error: result.error?.message,
      evidence,
    });
  },

  // Falha em before/beforeEach não passa pelo afterTest; captura a evidência aqui.
  async afterHook(test, _context, result, hookName) {
    if (result.passed) return;
    const evidence = await collectEvidence(`${test.parent} ${hookName}`, false);
    appendResult({
      title: hookName,
      suite: test.parent,
      passed: false,
      durationMs: result.duration ?? 0,
      error: result.error?.message,
      evidence,
    });
  },

  onComplete(exitCode) {
    writeSummary(exitCode);
  },
};
