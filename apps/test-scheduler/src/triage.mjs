// Triagem de falhas. Antes de chamar alguém, o agendador repete o job que
// falhou: se falhar em todas as repetições é bug; se passar em alguma é falha
// passageira; se a saída mostra que o ambiente caiu (device offline, rede,
// navegador ausente), o problema não é do sistema testado.
import { createHash } from 'node:crypto';

export const DEFAULT_RETRIES = 3;

/** Mensagens que indicam problema no ambiente de teste, não no app ou no site. */
export const ENVIRONMENT_PATTERNS = [
  /no (connected )?(android )?devices?( found| connected)?/i,
  /device (is )?offline/i,
  /emulator-\d+\s+(offline|unauthorized)/i,
  /adb: (device|server) .*(not found|offline|unauthorized|failed)/i,
  /could not (start|create) a new session/i,
  /session not created/i,
  /uiautomator2 server .*(crash|not running|exited)/i,
  /ECONNREFUSED .*:4723/i,
  /getaddrinfo (ENOTFOUND|EAI_AGAIN)/i,
  /net::ERR_(INTERNET_DISCONNECTED|NAME_NOT_RESOLVED|CONNECTION_REFUSED|NETWORK_CHANGED)/i,
  /executable doesn't exist at .*(chrom|firefox|webkit)/i,
  /\[scheduler\] falha ao iniciar/i,
];

const FAILED_STATUSES = new Set(['failed', 'timeout']);

export function looksLikeEnvironment(output = '') {
  return ENVIRONMENT_PATTERNS.some((pattern) => pattern.test(output));
}

/**
 * Primeira linha de erro da saída, sem números, para agrupar falhas iguais
 * mesmo quando mudam durações, portas ou ids.
 */
export function errorSignature(output = '') {
  // Linhas do próprio npm e do agendador só dizem que "algo falhou"; o erro útil vem do teste.
  const lines = output
    .split(/\r?\n/)
    .map((l) => l.replace(/\x1b\[[0-9;]*m/g, '').trim())
    .filter((l) => l && !/^(npm (error|ERR!)|\[scheduler\])/i.test(l));
  const line =
    lines.find((l) => /^(✖|✘|×)/.test(l)) ?? lines.find((l) => /(error|erro|failed|expected|timeout|indispon)/i.test(l));
  if (!line) return 'falha sem mensagem de erro';
  return line
    .replace(/\d+(\.\d+)?/g, 'N')
    .replace(/\s+/g, ' ')
    .slice(0, 160);
}

export function fingerprint(jobId, output) {
  return createHash('sha1').update(`${jobId}\n${errorSignature(output)}`).digest('hex').slice(0, 12);
}

/**
 * Máquina de estados da triagem, uma sessão por job. `handle` recebe cada
 * execução encerrada e devolve o que o agendador deve fazer:
 *   { action: 'none' }                        nada a fazer
 *   { action: 'retry', attempt }              enfileirar mais uma repetição
 *   { action: 'verdict', verdict }            triagem concluída
 */
export function createTriage({ retries = DEFAULT_RETRIES, now = () => new Date() } = {}) {
  const sessions = new Map();

  function verdictFrom(session, kind, lastRun) {
    sessions.delete(session.jobId);
    return {
      action: 'verdict',
      verdict: {
        id: `${session.jobId}-${session.origin.runId}`,
        jobId: session.jobId,
        jobName: session.jobName,
        kind,
        origin: session.origin,
        attempts: session.attempts,
        signature: errorSignature(session.origin.output || lastRun.output),
        fingerprint: fingerprint(session.jobId, session.origin.output || lastRun.output),
        startedAt: session.startedAt,
        decidedAt: now().toISOString(),
      },
    };
  }

  function handle(job, run) {
    if (run.trigger === 'triagem') {
      const session = sessions.get(job.id);
      if (!session) return { action: 'none' };
      session.attempts.push({ runId: run.runId, status: run.status });
      if (run.status === 'passed') return verdictFrom(session, 'flaky', run);
      if (run.status === 'stopped') {
        sessions.delete(job.id);
        return { action: 'none' };
      }
      if (looksLikeEnvironment(run.output)) return verdictFrom(session, 'environment', run);
      if (session.attempts.length >= retries) return verdictFrom(session, 'bug', run);
      return { action: 'retry', attempt: session.attempts.length + 1 };
    }

    if (!job.triage || !FAILED_STATUSES.has(run.status) || sessions.has(job.id)) return { action: 'none' };

    const session = {
      jobId: job.id,
      jobName: job.name,
      startedAt: now().toISOString(),
      origin: { runId: run.runId, status: run.status, output: run.output },
      attempts: [],
    };
    if (looksLikeEnvironment(run.output)) return verdictFrom(session, 'environment', run);
    if (retries < 1) return verdictFrom(session, 'bug', run);
    sessions.set(job.id, session);
    return { action: 'retry', attempt: 1 };
  }

  return {
    handle,
    cancel: (jobId) => sessions.delete(jobId),
    active: () =>
      [...sessions.values()].map(({ origin: { output: _output, ...origin }, ...session }) => ({
        ...session,
        origin,
        retries,
      })),
  };
}
