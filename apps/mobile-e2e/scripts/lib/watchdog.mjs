// Vigia do device. Se o emulador cai no meio da suíte, cada teste ainda espera
// os próprios timeouts e a execução só termina muito depois, sem dizer o
// motivo. O vigia pergunta ao adb de tempos em tempos e, depois de algumas
// respostas negativas seguidas, avisa para a suíte ser encerrada na hora.

/**
 * @param probe     () => boolean   true quando o device responde
 * @param maxMisses quantas falhas seguidas contam como queda (evita falso alarme)
 * @param onDown    chamado uma única vez quando o device cai
 */
export function createWatchdog({ probe, maxMisses = 2, onDown }) {
  let misses = 0;
  let down = false;
  let timer = null;

  function tick() {
    if (down) return 'down';
    if (probe()) {
      misses = 0;
      return 'up';
    }
    misses += 1;
    if (misses < maxMisses) return 'miss';
    down = true;
    onDown?.();
    return 'down';
  }

  return {
    tick,
    start(intervalMs = 15_000) {
      timer = setInterval(tick, intervalMs);
      timer.unref?.();
    },
    stop() {
      clearInterval(timer);
      timer = null;
    },
    isDown: () => down,
  };
}

/** Mensagem pensada para a triagem do agendador reconhecer como problema de ambiente. */
export const downMessage = (serial) =>
  `[watchdog] ${serial}: device offline — o emulador parou de responder; suíte encerrada agora em vez de esperar o timeout.`;
