import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { countProducts, createProbes, findBundle, findProductImage, findStylesheet, runProbes } from './lib/probes.mjs';

const HTML = '<html><link rel="stylesheet" href="/assets/index-x.css"><script type="module" src="/assets/index-y.js"></script></html>';
const BUNDLE = 'id="login-button"; [{image_url:`a.jpg`},{image_url:`b.jpg`},{image_url:`a.jpg`}]; Sd=`/assets/bike-light-1200x1500-DxcZ.jpg`';

/** Site falso: cada rota devolve status e corpo; o resto é 404. */
function fakeSite(overrides = {}) {
  const routes = {
    'https://loja.test/': [200, 'text/html', HTML],
    'https://loja.test/assets/index-y.js': [200, 'text/javascript', BUNDLE],
    'https://loja.test/assets/index-x.css': [200, 'text/css', 'body{}'],
    'https://loja.test/assets/bike-light-1200x1500-DxcZ.jpg': [200, 'image/jpeg', 'jpg'],
    ...overrides,
  };
  let requests = 0;
  const fetchImpl = async (url) => {
    requests += 1;
    const [status, type, body] = routes[url] ?? [404, 'text/plain', ''];
    return { ok: status < 400, status, headers: new Map([['content-type', type]]), text: async () => body };
  };
  return { fetchImpl, requests: () => requests };
}

describe('extração de links', () => {
  it('acha bundle, CSS, imagem de produto e conta produtos', () => {
    assert.equal(findBundle(HTML), '/assets/index-y.js');
    assert.equal(findStylesheet(HTML), '/assets/index-x.css');
    assert.equal(findProductImage(BUNDLE), '/assets/bike-light-1200x1500-DxcZ.jpg');
    assert.equal(countProducts(BUNDLE), 2);
  });
});

describe('runProbes', () => {
  it('com o site saudável todas passam e a página é baixada uma vez só', async () => {
    const site = fakeSite();
    const results = await runProbes(createProbes({ baseUrl: 'https://loja.test/', fetchImpl: site.fetchImpl }));
    assert.deepEqual(results.map((r) => [r.name, r.ok]), [['pagina', true], ['app', true], ['estilos', true], ['catalogo', true], ['imagens', true]]);
    assert.equal(site.requests(), 4);
  });

  it('isola a falha: só as imagens caem quando a imagem some', async () => {
    const site = fakeSite({ 'https://loja.test/assets/bike-light-1200x1500-DxcZ.jpg': [404, 'text/html', ''] });
    const results = await runProbes(createProbes({ baseUrl: 'https://loja.test/', fetchImpl: site.fetchImpl }));
    const failed = results.filter((r) => !r.ok).map((r) => r.name);
    assert.deepEqual(failed, ['imagens']);
    assert.match(results.find((r) => r.name === 'imagens').detail, /HTTP 404/);
  });

  it('imagem que responde HTML (página de erro) não conta como imagem', async () => {
    const site = fakeSite({ 'https://loja.test/assets/bike-light-1200x1500-DxcZ.jpg': [200, 'text/html', '<html>'] });
    const results = await runProbes(createProbes({ baseUrl: 'https://loja.test/', fetchImpl: site.fetchImpl }), ['imagens']);
    assert.equal(results[0].ok, false);
  });

  it('roda só as conferências pedidas e recusa nomes desconhecidos', async () => {
    const probes = createProbes({ baseUrl: 'https://loja.test/', fetchImpl: fakeSite().fetchImpl });
    assert.deepEqual((await runProbes(probes, ['catalogo'])).map((r) => r.name), ['catalogo']);
    await assert.rejects(runProbes(probes, ['banco']), /conferência desconhecida: banco/);
  });
});
