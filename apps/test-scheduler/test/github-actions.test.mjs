import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { createGithubActions, findWorkflow, logsFromZip, mediaFromZip, targetOfRun, validateInputs } from '../src/github-actions.mjs';

function fakeFetch(responses) {
  const calls = [];
  const impl = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET', headers: options.headers, body: options.body ? JSON.parse(options.body) : null });
    const match = responses.find(([pattern]) => pattern.test(url)) ?? [null, 200, {}];
    const [, status, body, headers = {}] = match;
    return {
      ok: status < 400,
      status,
      json: async () => body,
      arrayBuffer: async () => body,
      headers: { get: (name) => headers[name] ?? null },
    };
  };
  return { impl, calls };
}

const run = {
  id: 7,
  run_number: 12,
  display_title: 'Mobile E2E · spec login',
  event: 'workflow_dispatch',
  status: 'completed',
  conclusion: 'success',
  head_branch: 'main',
  created_at: '2026-10-15T10:00:00Z',
  run_started_at: '2026-10-15T10:00:05Z',
  updated_at: '2026-10-15T10:09:00Z',
  html_url: 'u',
};

describe('validateInputs', () => {
  const mobile = findWorkflow('mobile-e2e.yml');

  it('aceita só inputs conhecidos e valores da lista', () => {
    assert.deepEqual(validateInputs(mobile, { suite: 'regression' }), { inputs: { suite: 'regression' } });
    assert.match(validateInputs(mobile, { suite: 'tudo' }).error, /smoke, regression, spec/);
    assert.match(validateInputs(mobile, { branch: 'x' }).error, /não existe/);
    assert.match(validateInputs(findWorkflow('ci.yml'), { suite: 'smoke' }).error, /não existe/);
  });

  it('spec exige o nome da spec; nas suítes o nome é descartado', () => {
    assert.deepEqual(validateInputs(mobile, { suite: 'spec', specName: 'cart' }), { inputs: { suite: 'spec', specName: 'cart' } });
    assert.match(validateInputs(mobile, { suite: 'spec' }).error, /exige specName/);
    assert.deepEqual(validateInputs(mobile, { suite: 'smoke', specName: 'cart' }), { inputs: { suite: 'smoke' } });
    assert.match(validateInputs(mobile, { suite: 'spec', specName: '../x' }).error, /specName deve ser/);
  });
});

describe('targetOfRun', () => {
  it('lê o alvo do nome da execução', () => {
    assert.equal(targetOfRun('Mobile E2E · smoke'), 'smoke');
    assert.equal(targetOfRun('Mobile E2E · regression'), 'regression');
    assert.equal(targetOfRun('Mobile E2E · spec product-details'), 'spec:product-details');
    assert.equal(targetOfRun('feat: commit qualquer'), null);
  });
});

describe('createGithubActions', () => {
  it('lista execuções sem token, com o alvo, e guarda em cache', async () => {
    const { impl, calls } = fakeFetch([[/runs\?/, 200, { workflow_runs: [run] }]]);
    let clock = 0;
    const gh = createGithubActions({ repository: 'o/r', fetchImpl: impl, now: () => clock });
    const [first] = await gh.runs('mobile-e2e.yml');
    assert.equal(first.target, 'spec:login');
    assert.equal(first.runNumber, 12);
    assert.equal(calls[0].headers.Authorization, undefined);
    clock = 30_000;
    await gh.runs('mobile-e2e.yml');
    assert.equal(calls.length, 1, 'sem token o cache dura 60 s');
    clock = 61_000;
    await gh.runs('mobile-e2e.yml');
    assert.equal(calls.length, 2);
  });

  it('explica quando falta o repositório ou ele não existe', async () => {
    await assert.rejects(createGithubActions({}).runs('ci.yml'), /GITHUB_REPOSITORY/);
    const gh = createGithubActions({ repository: 'o/r', fetchImpl: fakeFetch([[/./, 404, {}]]).impl });
    await assert.rejects(gh.runs('ci.yml'), /já foi publicado/);
  });

  it('explica o limite de consultas esgotado', async () => {
    const gh = createGithubActions({ repository: 'o/r', fetchImpl: fakeFetch([[/./, 403, {}, { 'x-ratelimit-remaining': '0' }]]).impl });
    await assert.rejects(gh.runs('ci.yml'), /limite de consultas ao GitHub esgotado \(sem token são 60 por hora\)/);
  });

  it('isIdle ignora o cache e olha se há execução pendente', async () => {
    const pending = { ...run, status: 'in_progress', conclusion: null };
    const { impl, calls } = fakeFetch([[/runs\?/, 200, { workflow_runs: [pending] }]]);
    const gh = createGithubActions({ repository: 'o/r', token: 't', fetchImpl: impl });
    assert.equal(await gh.isIdle('mobile-e2e.yml'), false);
    await gh.isIdle('mobile-e2e.yml');
    assert.equal(calls.length, 2);
  });

  it('disparar e cancelar exigem token', async () => {
    const gh = createGithubActions({ repository: 'o/r', fetchImpl: fakeFetch([]).impl });
    await assert.rejects(gh.dispatch('ci.yml', {}), /GITHUB_TOKEN/);
    await assert.rejects(gh.cancel(1), /GITHUB_TOKEN/);
    await assert.rejects(gh.logs(1), /GITHUB_TOKEN/);
  });

  it('disparo manda ref e inputs validados', async () => {
    const { impl, calls } = fakeFetch([[/dispatches$/, 204, null]]);
    const gh = createGithubActions({ repository: 'o/r', token: 't', fetchImpl: impl });
    await gh.dispatch('mobile-e2e.yml', { suite: 'spec', specName: 'cart' });
    assert.equal(calls[0].method, 'POST');
    assert.match(calls[0].url, /\/actions\/workflows\/mobile-e2e\.yml\/dispatches$/);
    assert.deepEqual(calls[0].body, { ref: 'main', inputs: { suite: 'spec', specName: 'cart' } });
    await assert.rejects(gh.dispatch('deploy.yml', {}), /desconhecido/);
  });

  it('baixa as evidências dos artifacts uma vez e guarda em disco', async () => {
    const zip = new AdmZip();
    zip.addFile('screenshots/falha.png', Buffer.from('png'));
    zip.addFile('summary.json', Buffer.from('{}'));
    const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-media-'));
    const { impl, calls } = fakeFetch([
      [/\/runs\/7\/artifacts$/, 200, { artifacts: [{ id: 3, expired: false }] }],
      [/\/artifacts\/3\/zip$/, 200, zip.toBuffer()],
    ]);
    const gh = createGithubActions({ repository: 'o/r', token: 't', fetchImpl: impl, mediaDir });
    assert.deepEqual(await gh.media(7), [{ name: 'falha.png', type: 'image/png', size: 3 }]);
    await gh.media(7);
    assert.equal(calls.length, 2, 'a segunda consulta lê do disco');
    assert.ok(gh.mediaPath(7, 'falha.png'));
    assert.equal(gh.mediaPath(7, '../../segredo.txt'), null);
  });
});

describe('zip do GitHub', () => {
  it('junta os logs dos passos sem o carimbo de hora', () => {
    const zip = new AdmZip();
    zip.addFile('0_android.txt', Buffer.from('resumo'));
    zip.addFile('android/2_Executar smoke.txt', Buffer.from('2026-10-15T10:00:00.1234567Z ✔ login\n'));
    zip.addFile('android/1_Set up job.txt', Buffer.from('2026-10-15T10:00:00.0000000Z preparando\n'));
    const text = logsFromZip(zip.toBuffer());
    assert.match(text, /── Set up job\npreparando[\s\S]*── Executar smoke\n✔ login/);
    assert.doesNotMatch(text, /resumo|2026-10-15T/);
  });

  it('extrai só vídeos e imagens', () => {
    const zip = new AdmZip();
    zip.addFile('videos/teste.mp4', Buffer.from('mp4'));
    zip.addFile('logs/wdio.log', Buffer.from('log'));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-'));
    assert.deepEqual(mediaFromZip(zip.toBuffer(), dir).map((m) => m.name), ['teste.mp4']);
  });
});
