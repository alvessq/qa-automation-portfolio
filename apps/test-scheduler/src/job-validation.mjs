// Validação dos jobs. O agendador só executa scripts npm que existem nos
// workspaces de teste conhecidos: nunca um comando livre vindo da API.
import fs from 'node:fs';
import path from 'node:path';
import { parseTime } from './schedule-window.mjs';

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
 */
export function validateJob(input, availableScripts) {
  const errors = [];
  const job = {
    id: String(input?.id ?? '').trim(),
    name: String(input?.name ?? '').trim(),
    workspace: String(input?.workspace ?? '').trim(),
    script: String(input?.script ?? '').trim(),
    intervalMinutes: Number(input?.intervalMinutes),
    window: input?.window ? { from: String(input.window.from), to: String(input.window.to) } : null,
    timeoutMinutes: Number(input?.timeoutMinutes ?? 15),
    enabled: input?.enabled !== false,
  };

  if (!ID_PATTERN.test(job.id)) errors.push('id deve ter 2–41 caracteres: letras minúsculas, números e hífen');
  if (!job.name) errors.push('name é obrigatório');
  if (!ALLOWED_WORKSPACES.includes(job.workspace)) {
    errors.push(`workspace deve ser um de: ${ALLOWED_WORKSPACES.join(', ')}`);
  } else if (!SCRIPT_PATTERN.test(job.script) || !availableScripts[job.workspace]?.includes(job.script)) {
    errors.push(`script "${job.script}" não existe em ${job.workspace}/package.json`);
  }
  if (!Number.isInteger(job.intervalMinutes) || job.intervalMinutes < 1 || job.intervalMinutes > 7 * 24 * 60) {
    errors.push('intervalMinutes deve ser um inteiro entre 1 e 10080');
  }
  if (!Number.isInteger(job.timeoutMinutes) || job.timeoutMinutes < 1 || job.timeoutMinutes > 180) {
    errors.push('timeoutMinutes deve ser um inteiro entre 1 e 180');
  }
  if (job.window) {
    for (const key of ['from', 'to']) {
      try {
        parseTime(job.window[key]);
      } catch (error) {
        errors.push(`window.${key}: ${error.message}`);
      }
    }
  }

  return errors.length ? { errors } : { job };
}
