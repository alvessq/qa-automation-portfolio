// Validação dos jobs. O agendador só executa scripts npm que existem nos
// workspaces de teste conhecidos: nunca um comando livre vindo da API.
import fs from 'node:fs';
import path from 'node:path';
import { parseTime } from './schedule-window.mjs';
import { findWorkflow, validateInputs } from './github-actions.mjs';

export const ALLOWED_WORKSPACES = ['web-e2e', 'mobile-e2e'];
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,40}$/;
const SCRIPT_PATTERN = /^[a-zA-Z0-9:_-]{1,60}$/;

/** Scripts npm disponíveis em cada workspace permitido. */
export function loadAvailableScripts(appsDir) {
  const available = {};
  for (const workspace of ALLOWED_WORKSPACES) {
    const manifest = path.join(appsDir, workspace, 'package.json');
    if (!fs.existsSync(manifest)) continue;
    const { scripts = {} } = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    // Hooks pre/post não são executados diretamente.
    available[workspace] = Object.keys(scripts).filter((name) => !/^(pre|post)/.test(name));
  }
  return available;
}

/**
 * Valida e normaliza um job. Devolve { job } ou { errors }.
 * `availableScripts` vem de loadAvailableScripts().
 *
 * Dois tipos: local (padrão) roda um script npm de um workspace de teste;
 * nuvem (`target: "cloud"`) dispara um workflow conhecido do GitHub Actions.
 */
export function validateJob(input, availableScripts) {
  return input?.target === 'cloud' ? validateCloudJob(input) : validateLocalJob(input, availableScripts);
}

function commonFields(input, errors) {
  const common = {
    id: String(input?.id ?? '').trim(),
    name: String(input?.name ?? '').trim(),
    intervalMinutes: Number(input?.intervalMinutes),
    window: input?.window ? { from: String(input.window.from), to: String(input.window.to) } : null,
    enabled: input?.enabled !== false,
  };
  if (!ID_PATTERN.test(common.id)) errors.push('id deve ter 2–41 caracteres: letras minúsculas, números e hífen');
  if (!common.name) errors.push('name é obrigatório');
  if (!Number.isInteger(common.intervalMinutes) || common.intervalMinutes < 1 || common.intervalMinutes > 7 * 24 * 60) {
    errors.push('intervalMinutes deve ser um inteiro entre 1 e 10080');
  }
  if (common.window) {
    for (const key of ['from', 'to']) {
      try {
        parseTime(common.window[key]);
      } catch (error) {
        errors.push(`window.${key}: ${error.message}`);
      }
    }
  }
  return common;
}

function validateCloudJob(input) {
  const errors = [];
  const common = commonFields(input, errors);
  const workflow = findWorkflow(String(input?.workflow ?? ''));
  let inputs = {};
  if (!workflow) {
    errors.push(`workflow deve ser um de: ci.yml, mobile-e2e.yml, web-monitoring.yml`);
  } else {
    const checked = validateInputs(workflow, input?.inputs);
    if (checked.error) errors.push(checked.error);
    else inputs = checked.inputs;
  }
  const job = { ...common, target: 'cloud', workflow: workflow?.file ?? '', inputs };
  return errors.length ? { errors } : { job };
}

function validateLocalJob(input, availableScripts) {
  const errors = [];
  const { id, name, intervalMinutes, window, enabled } = commonFields(input, errors);
  const job = {
    id,
    name,
    workspace: String(input?.workspace ?? '').trim(),
    script: String(input?.script ?? '').trim(),
    intervalMinutes,
    window,
    timeoutMinutes: Number(input?.timeoutMinutes ?? 15),
    enabled,
    // Repetir antes de avisar só faz sentido para suítes E2E; health check falha rápido.
    triage: input?.triage === true,
  };

  if (!ALLOWED_WORKSPACES.includes(job.workspace)) {
    errors.push(`workspace deve ser um de: ${ALLOWED_WORKSPACES.join(', ')}`);
  } else if (!SCRIPT_PATTERN.test(job.script) || !availableScripts[job.workspace]?.includes(job.script)) {
    errors.push(`script "${job.script}" não existe em ${job.workspace}/package.json`);
  }
  if (!Number.isInteger(job.timeoutMinutes) || job.timeoutMinutes < 1 || job.timeoutMinutes > 180) {
    errors.push('timeoutMinutes deve ser um inteiro entre 1 e 180');
  }

  return errors.length ? { errors } : { job };
}
