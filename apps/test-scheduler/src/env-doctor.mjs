// Confere, na subida, quais configurações estão definidas e o que cada ausência
// desliga. Os .env ficam fora do Git, então depois de um clone novo esta é a
// única pista do que falta repor. Nunca devolve nem registra os valores.
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

/**
 * kind:
 *   default  → ausente usa um padrão seguro (informativo)
 *   feature  → ausente desliga um recurso opcional
 *   required → ausente impede aquele workspace de rodar
 * `names` com mais de um item exige todos; `anyOf` aceita qualquer um.
 */
export const ENV_CHECKS = [
  { workspace: 'web-e2e', names: ['BASE_URL'], kind: 'default', impact: 'usa o Sauce Demo público' },
  { workspace: 'web-e2e', names: ['SAUCE_STANDARD_USER', 'SAUCE_PASSWORD'], kind: 'default', impact: 'usa as credenciais públicas do site' },
  { workspace: 'mobile-e2e', anyOf: ['ANDROID_HOME', 'ANDROID_SDK_ROOT'], kind: 'required', impact: 'os testes mobile não encontram o Android SDK' },
  { workspace: 'mobile-e2e', names: ['ANDROID_UDID'], kind: 'default', impact: 'usa o primeiro device conectado' },
  { workspace: 'test-scheduler', names: ['GITHUB_REPOSITORY', 'GITHUB_TOKEN'], kind: 'feature', impact: 'bug confirmado não vira issue no GitHub' },
  { workspace: 'test-scheduler', names: ['TRIAGE_WEBHOOK_URL'], kind: 'feature', impact: 'vereditos da triagem não geram aviso por webhook' },
  { workspace: 'test-scheduler', names: ['PANEL_USER', 'PANEL_PASSWORD'], kind: 'feature', impact: 'painel sem login (só é aceito escutando em localhost)' },
];

function readEnvFile(file) {
  try {
    return dotenv.parse(fs.readFileSync(file));
  } catch {
    return {};
  }
}

/** Valor efetivo de cada variável: o .env do workspace, depois o ambiente do processo. */
export function effectiveEnv(appsDir, processEnv = process.env) {
  const byWorkspace = {};
  for (const workspace of new Set(ENV_CHECKS.map((c) => c.workspace))) {
    byWorkspace[workspace] = { ...processEnv, ...readEnvFile(path.join(appsDir, workspace, '.env')) };
  }
  return byWorkspace;
}

const isSet = (env, name) => String(env[name] ?? '').trim() !== '';

/** Lista de { workspace, names, kind, status, impact }, sem valores. */
export function diagnose(envByWorkspace) {
  return ENV_CHECKS.map((check) => {
    const env = envByWorkspace[check.workspace] ?? {};
    const names = check.anyOf ?? check.names;
    const present = names.filter((name) => isSet(env, name));
    let status;
    if (check.anyOf) status = present.length ? 'ok' : 'missing';
    else status = present.length === names.length ? 'ok' : present.length ? 'partial' : 'missing';
    return {
      workspace: check.workspace,
      names,
      anyOf: Boolean(check.anyOf),
      kind: check.kind,
      status,
      impact: status === 'ok' ? null : check.impact,
    };
  });
}

/** Linhas para o log de subida: só o que falta, nunca valores. */
export function summarize(report) {
  return report
    .filter((item) => item.status !== 'ok' && item.kind !== 'default')
    .map((item) => {
      const names = item.names.join(item.anyOf ? ' / ' : ' + ');
      const what = item.status === 'partial' ? `${names} incompleto` : `${names} ausente`;
      return `[config] ${item.workspace}: ${what} — ${item.impact}`;
    });
}
