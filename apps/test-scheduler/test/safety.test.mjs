import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { basicAuth, exposureError, startPaused } from '../src/safety.mjs';

function call(middleware, authorization) {
  const res = {
    statusCode: 200,
    headers: {},
    set(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json() { return this; },
  };
  let passed = false;
  middleware({ headers: authorization ? { authorization } : {} }, res, () => { passed = true; });
  return { passed, res };
}
const basic = (user, password) => `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

describe('basicAuth', () => {
  it('sem credenciais configuradas deixa passar', () => {
    assert.equal(call(basicAuth({}), undefined).passed, true);
  });

  it('aceita usuário e senha corretos, inclusive senha com dois-pontos', () => {
    assert.equal(call(basicAuth({ user: 'kevin', password: 'a:b' }), basic('kevin', 'a:b')).passed, true);
  });

  it('recusa sem cabeçalho, com senha errada ou com outro esquema', () => {
    const auth = basicAuth({ user: 'kevin', password: 'certa' });
    for (const header of [undefined, basic('kevin', 'errada'), basic('outro', 'certa'), 'Bearer x']) {
      const { passed, res } = call(auth, header);
      assert.equal(passed, false, header);
      assert.equal(res.statusCode, 401);
      assert.match(res.headers['WWW-Authenticate'], /^Basic/);
    }
  });
});

describe('exposureError', () => {
  it('localhost sem login é aceito', () => {
    assert.equal(exposureError('127.0.0.1', {}), null);
  });

  it('rede sem login é recusada; com login é aceita', () => {
    assert.match(exposureError('0.0.0.0', {}), /PANEL_USER/);
    assert.equal(exposureError('0.0.0.0', { user: 'a', password: 'b' }), null);
  });
});

describe('startPaused', () => {
  it('começa pausado por padrão no uso local', () => {
    assert.equal(startPaused({}), true);
  });

  it('START_PAUSED=false liga a agenda e a CI nunca começa pausada', () => {
    assert.equal(startPaused({ START_PAUSED: 'false' }), false);
    assert.equal(startPaused({ CI: 'true' }), false);
  });
});
