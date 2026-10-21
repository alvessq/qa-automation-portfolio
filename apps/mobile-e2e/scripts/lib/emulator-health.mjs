// Saúde do emulador e preparo antes de uma suíte.
//
// Saudável = o adb enxerga o device como "device" E o Android terminou de
// ligar (sys.boot_completed = 1). Só "device" não basta: logo depois do boot o
// adb já responde, mas o sistema ainda está subindo e o app trava ao abrir.
//
// Na CI, antes dos testes, o emulador sem GPU recebe alguns ajustes que o
// deixam estável: resolução menor (menos pixels para renderizar por
// software), animações desligadas e o diálogo de "não está respondendo"
// fechado. Se ele não estiver saudável, é reiniciado uma vez.

/** Lista { serial, state } de `adb devices`, incluindo offline e não autorizados. */
export function parseDeviceStates(output = '') {
  return output
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter(([serial, state]) => serial && state)
    .map(([serial, state]) => ({ serial, state }));
}

/** `run(args, opts)` executa o adb e devolve { ok, stdout }. */
export function checkHealth(run, serial) {
  const state = run(['-s', serial, 'get-state'], { timeout: 10_000 });
  if (!state.ok || state.stdout !== 'device') return { healthy: false, reason: `adb vê o device como "${state.stdout || 'ausente'}"` };
  const booted = run(['-s', serial, 'shell', 'getprop', 'sys.boot_completed'], { timeout: 10_000 });
  if (booted.stdout !== '1') return { healthy: false, reason: 'o Android ainda não terminou de ligar' };
  return { healthy: true, reason: 'device online e Android ligado' };
}

/** Espera o emulador ficar saudável. Devolve o último resultado da conferência. */
export async function waitHealthy(run, serial, { timeoutMs = 600_000, stepMs = 3_000, sleep, now = Date.now } = {}) {
  const deadline = now() + timeoutMs;
  let last = checkHealth(run, serial);
  while (!last.healthy && now() < deadline) {
    await sleep(stepMs);
    last = checkHealth(run, serial);
  }
  return last;
}

/** Resolução da CI: o mesmo layout de um celular comum, com bem menos pixels. */
export const CI_SCREEN = { size: '720x1600', density: '280' };

/** Ajustes que deixam o emulador sem GPU estável para os testes. */
export function tuneForCi(run, serial) {
  const shell = (...args) => run(['-s', serial, 'shell', ...args], { timeout: 15_000 });
  shell('wm', 'size', CI_SCREEN.size);
  shell('wm', 'density', CI_SCREEN.density);
  for (const key of ['window_animation_scale', 'transition_animation_scale', 'animator_duration_scale']) {
    shell('settings', 'put', 'global', key, '0');
  }
  // Fecha diálogos do sistema, como o "não está respondendo" do launcher lento.
  shell('am', 'broadcast', '-a', 'android.intent.action.CLOSE_SYSTEM_DIALOGS');
}

/**
 * Prepara o emulador para a suíte: espera ficar saudável, reinicia uma vez se
 * não ficar e aplica os ajustes da CI. Devolve { ok, rebooted, reason }.
 */
export async function prepareForSuite(run, serial, { sleep, log = () => {}, bootTimeoutMs = 600_000, tune = true } = {}) {
  let health = await waitHealthy(run, serial, { timeoutMs: bootTimeoutMs, sleep });
  let rebooted = false;
  if (!health.healthy) {
    log(`[emulador] ${serial} não está saudável (${health.reason}): reiniciando uma vez…`);
    run(['-s', serial, 'reboot'], { timeout: 30_000 });
    rebooted = true;
    await sleep(10_000);
    run(['-s', serial, 'wait-for-device'], { timeout: bootTimeoutMs });
    health = await waitHealthy(run, serial, { timeoutMs: bootTimeoutMs, sleep });
    if (!health.healthy) return { ok: false, rebooted, reason: `device offline: ${serial} não voltou depois do reinício (${health.reason})` };
  }
  if (tune) tuneForCi(run, serial);
  log(`[emulador] ${serial} pronto${rebooted ? ' depois do reinício' : ''}: ${health.reason}.`);
  return { ok: true, rebooted, reason: health.reason };
}

/** Desfaz os ajustes de tela da CI (eles ficam gravados no AVD). */
export function resetTuning(run, serial) {
  run(['-s', serial, 'shell', 'wm', 'size', 'reset'], { timeout: 15_000 });
  run(['-s', serial, 'shell', 'wm', 'density', 'reset'], { timeout: 15_000 });
}
