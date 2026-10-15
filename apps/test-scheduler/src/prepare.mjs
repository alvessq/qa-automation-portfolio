// Preparação do celular ao abrir o painel: baixa o APK se saiu versão nova e
// liga um emulador se nenhum device estiver online (mobile-e2e: prepare:device).
// Roda em segundo plano para não atrasar o painel.

/**
 * PREPARE_MOBILE=true sempre prepara; =false nunca; sem valor, prepara só se
 * existir algum job mobile ativo (abrir o painel para consultar não liga emulador).
 */
export function shouldPrepare(env, jobs) {
  if (env.PREPARE_MOBILE === 'true') return true;
  if (env.PREPARE_MOBILE === 'false' || env.CI === 'true') return false;
  return jobs.some((job) => job.enabled && job.workspace === 'mobile-e2e');
}

export function createPreparer({ spawnScript, onChange = () => {} }) {
  let state = { status: 'idle', startedAt: null, finishedAt: null, output: '' };

  function start() {
    if (state.status === 'running') return false;
    state = { status: 'running', startedAt: new Date().toISOString(), finishedAt: null, output: '' };
    onChange();
    const child = spawnScript('mobile-e2e', 'prepare:device');
    const append = (chunk) => {
      state.output = (state.output + chunk.toString()).slice(-6000);
    };
    child.stdout?.on('data', append);
    child.stderr?.on('data', append);
    child.on('error', (error) => append(`\n[preparo] falha ao iniciar: ${error.message}\n`));
    child.on('close', (code) => {
      state = { ...state, status: code === 0 ? 'ready' : 'failed', finishedAt: new Date().toISOString() };
      onChange();
    });
    return true;
  }

  return { start, state: () => state };
}
