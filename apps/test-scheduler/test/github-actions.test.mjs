import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createGithubActions, findWorkflow, validateInputs } from '../src/github-actions.mjs';
import { validateJob } from '../src/job-validation.mjs';

function fakeFetch(status = 200, body = { workflow_runs: [] }) {
  const calls = [];
  const impl = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET', headers: options.headers, body: options.body ? JSON.parse(options.body) : null });
    return { ok: status < 400, status, json: async () => body };
  };
  return { impl, calls };
}

describe('validateInputs', () => {
  it('aceita só inputs conhecidos e valores da lista', () => {
    const mobile = findWorkflow('mobile-e2e.yml');
    assert.deepEqual(validateInputs(mobile, { suite: 'regression' }), { inputs: { suite: 'regression' } });
    assert.match(validateInputs(mobile, { suite: 'tudo' }).error, /smoke, regression/);
    assert.match(validateInputs(mobile, { branch: 'x' }).error, /não existe/);
    assert.match(validateInputs(findWorkflow('ci.yml'), { suite: 'smoke' }).error, /não existe/);
  });
});

describe('createGithubActions', () => {
  const run = { id: 1, display_title: 'ci: teste', event: 'push', status: 'completed', conclusion: 'success', head_branch: 'main', created_at: '2026-10-15T10:00:00Z', html_url: 'u' };

  it('lista execuções sem token e guarda em cache', async () => {
    const { impl, calls } = fakeFetch(200, { workflow_runs: [run] });
    let clock = 0;
    const gh = createGithubActions({ repository: 'o/r', fetchImpl: impl, now: () => clock });
    const first = await gh.overview();
    assert.equal(first.error, null);
    assert.equal(first.workflows[0].runs[0].conclusion, 'success');
    assert.equal(calls[0].headers.Authorization, undefined);
    const before = calls.length;
    clock = 30_000;
    await gh.overview();
    assert.equal(calls.length, before, 'dentro do cache não chama de novo');
    clock = 61_000;
    await gh.overview();
    assert.ok(calls.length > before);
  });

  it('explica quando o repositório ainda não existe', async () => {
    const gh = createGithubActions({ repository: 'o/r', fetchImpl: fakeFetch(404).impl });
    assert.match((await gh.overview()).error, /já foi publicado/);
  });

  it('sem GITHUB_REPOSITORY pede a configuração', async () => {
    assert.match((await createGithubActions({}).overview()).error, /GITHUB_REPOSITORY/);
  });

  it('disparo exige token e manda ref e inputs validados', async () => {
    await assert.rejects(createGithubActions({ repository: 'o/r', fetchImpl: fakeFetch(204).impl }).dispatch('ci.yml', {}), /GITHUB_TOKEN/);

    const { impl, calls } = fakeFetch(204);
    const gh = createGithubActions({ repository: 'o/r', token: 't', fetchImpl: impl });
    await gh.dispatch('mobile-e2e.yml', { suite: 'smoke' });
    assert.equal(calls[0].method, 'POST');
    assert.match(calls[0].url, /\/actions\/workflows\/mobile-e2e\.yml\/dispatches$/);
    assert.deepEqual(calls[0].body, { ref: 'main', inputs: { suite: 'smoke' } });
    await assert.rejects(gh.dispatch('deploy.yml', {}), /desconhecido/);
  });
});

describe('job de nuvem', () => {
  const base = { id: 'nuvem-smoke', name: 'Nuvem', target: 'cloud', workflow: 'mobile-e2e.yml', inputs: { suite: 'smoke' }, intervalMinutes: 360 };

  it('é validado sem workspace nem script', () => {
    const { job, errors } = validateJob(base, {});
    assert.equal(errors, undefined);
    assert.deepEqual(job, { id: 'nuvem-smoke', name: 'Nuvem', intervalMinutes: 360, window: null, enabled: true, target: 'cloud', workflow: 'mobile-e2e.yml', inputs: { suite: 'smoke' } });
  });

  it('recusa workflow fora da lista e input inválido', () => {
    assert.match(validateJob({ ...base, workflow: 'deploy.yml' }, {}).errors.join(), /workflow deve ser/);
    assert.match(validateJob({ ...base, inputs: { suite: 'tudo' } }, {}).errors.join(), /suite deve ser/);
  });
});
