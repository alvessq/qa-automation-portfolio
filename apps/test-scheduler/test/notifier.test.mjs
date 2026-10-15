import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createNotifier, describeVerdict, issueBody } from '../src/notifier.mjs';

const verdict = (kind) => ({
  id: 'web-smoke-run-1',
  jobId: 'web-smoke',
  jobName: 'Web · smoke',
  kind,
  origin: { runId: 'run-1', status: 'failed' },
  attempts: [
    { runId: 'run-2', status: 'failed' },
    { runId: 'run-3', status: 'failed' },
    { runId: 'run-4', status: 'failed' },
  ],
  signature: 'Error: total errado',
  fingerprint: 'abc123def456',
});

/** fetch falso: responde pela ordem das rotas e registra as chamadas. */
function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null });
    const route = routes.find((r) => url.includes(r.match) && (r.method || 'GET') === (options.method || 'GET'));
    if (!route) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: route.status ? route.status < 400 : true, status: route.status ?? 200, json: async () => route.json };
  };
  return { impl, calls };
}

const quiet = () => {};

describe('createNotifier', () => {
  it('sem configuração não chama nada', async () => {
    const { impl, calls } = fakeFetch([]);
    const notifier = createNotifier({ fetchImpl: impl, log: quiet });
    assert.deepEqual(notifier.channels, { github: false, webhook: false });
    const result = await notifier.notify(verdict('bug'), 'saída');
    assert.equal(calls.length, 0);
    assert.equal(result.issue, null);
  });

  it('abre issue para bug confirmado, com rótulos e marcador da falha', async () => {
    const { impl, calls } = fakeFetch([
      { match: '/issues?state=open', json: [] },
      { match: '/issues', method: 'POST', json: { number: 7, html_url: 'https://github.com/o/r/issues/7' } },
    ]);
    const notifier = createNotifier({ repository: 'o/r', token: 't', fetchImpl: impl, log: quiet });
    const result = await notifier.notify(verdict('bug'), 'Error: total errado');

    assert.deepEqual(result.issue, { url: 'https://github.com/o/r/issues/7', number: 7, reused: false });
    const created = calls.find((c) => c.method === 'POST');
    assert.deepEqual(created.body.labels, ['triagem', 'bug']);
    assert.match(created.body.body, /triagem:fingerprint=abc123def456/);
  });

  it('comenta na issue aberta em vez de duplicar', async () => {
    const { impl, calls } = fakeFetch([
      { match: '/issues?state=open', json: [{ number: 3, html_url: 'u3', body: 'x <!-- triagem:fingerprint=abc123def456 -->' }] },
      { match: '/issues/3/comments', method: 'POST', json: {} },
    ]);
    const notifier = createNotifier({ repository: 'o/r', token: 't', fetchImpl: impl, log: quiet });
    const result = await notifier.notify(verdict('bug'), '');

    assert.equal(result.issue.reused, true);
    assert.equal(calls.filter((c) => c.method === 'POST' && c.url.endsWith('/issues')).length, 0);
  });

  it('falha passageira e ambiente não abrem issue, só avisam no webhook', async () => {
    for (const kind of ['flaky', 'environment']) {
      const { impl, calls } = fakeFetch([{ match: 'hooks.example', method: 'POST', json: {} }]);
      const notifier = createNotifier({ repository: 'o/r', token: 't', webhookUrl: 'https://hooks.example/x', fetchImpl: impl, log: quiet });
      const result = await notifier.notify(verdict(kind), '');
      assert.equal(result.issue, null, kind);
      assert.equal(result.webhook, true, kind);
      assert.equal(calls.length, 1, kind);
      assert.equal(calls[0].body.text, calls[0].body.content);
    }
  });

  it('não lança quando o GitHub está fora do ar', async () => {
    const { impl } = fakeFetch([{ match: '/issues', status: 503 }]);
    const notifier = createNotifier({ repository: 'o/r', token: 't', fetchImpl: impl, log: quiet });
    const result = await notifier.notify(verdict('bug'), '');
    assert.equal(result.issue, null);
    assert.match(result.errors[0], /HTTP 503/);
  });
});

describe('textos', () => {
  it('descreve cada veredito em uma linha', () => {
    assert.match(describeVerdict(verdict('bug')), /Bug confirmado: Web · smoke \(3 repetição/);
    assert.match(describeVerdict(verdict('flaky')), /Falha passageira/);
  });

  it('o corpo da issue não deixa a saída quebrar o bloco de código', () => {
    const body = issueBody(verdict('bug'), 'antes ``` depois');
    assert.equal(body.split('```').length - 1, 2);
  });
});
