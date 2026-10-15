// Conferências do site alvo, uma por "serviço" que a loja precisa para funcionar.
// Cada uma roda isolada e tem o próprio resultado: quando algo cai, dá para saber
// o quê, em vez de um "site fora do ar" genérico.

/** Links que a página inicial aponta: bundle JS, folha de estilo. */
export const findBundle = (html) => /<script[^>]+src="([^"]+\.js)"/.exec(html)?.[1] ?? null;
export const findStylesheet = (html) => /<link[^>]+href="([^"]+\.css)"/.exec(html)?.[1] ?? null;
/** Primeira imagem de produto empacotada no bundle (ex.: /assets/bike-light-1200x1500-abc.jpg). */
export const findProductImage = (source) => /[`'"](\/assets\/[\w-]+-\d+x\d+-[\w-]+\.(?:jpg|jpeg|png))[`'"]/.exec(source)?.[1] ?? null;
/**
 * Produtos distintos do catálogo. O bundle repete o catálogo para cada usuário
 * de teste e o problem_user usa uma imagem quebrada de propósito (sl-404.jpg).
 */
export const countProducts = (source) =>
  new Set(
    [...source.matchAll(/image_url\s*:\s*[`'"]([^`'"]+)[`'"]/g)].map((m) => m[1]).filter((name) => !/404/.test(name)),
  ).size;

/**
 * As conferências compartilham downloads: a página e o bundle são buscados uma
 * vez por execução, mesmo quando várias conferências precisam deles.
 */
export function createProbes({ baseUrl, fetchImpl = fetch, timeoutMs = 15_000 }) {
  const cache = new Map();
  const get = (url) => {
    const absolute = new URL(url, baseUrl).href;
    if (!cache.has(absolute)) {
      cache.set(
        absolute,
        fetchImpl(absolute, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) }).then(async (response) => ({
          ok: response.ok,
          status: response.status,
          type: response.headers.get('content-type') ?? '',
          body: await response.text(),
        })),
      );
    }
    return cache.get(absolute);
  };

  const page = async () => {
    const res = await get(baseUrl);
    if (!res.ok) throw new Error(`página respondeu HTTP ${res.status}`);
    return res.body;
  };
  const bundle = async () => {
    const path = findBundle(await page());
    if (!path) throw new Error('a página não aponta para o JavaScript do app');
    const res = await get(path);
    if (!res.ok) throw new Error(`${path} respondeu HTTP ${res.status}`);
    return res.body;
  };

  return [
    { name: 'pagina', label: 'Página inicial', run: async () => `HTTP 200, ${(await page()).length} bytes` },
    {
      name: 'app',
      label: 'Aplicativo com formulário de login',
      run: async () => {
        if (!(await bundle()).includes('login-button')) throw new Error('JavaScript sem o formulário de login');
        return 'formulário de login presente';
      },
    },
    {
      name: 'estilos',
      label: 'Folha de estilo',
      run: async () => {
        const path = findStylesheet(await page());
        if (!path) throw new Error('a página não aponta para nenhum CSS');
        const res = await get(path);
        if (!res.ok) throw new Error(`${path} respondeu HTTP ${res.status}`);
        return `${path} carregou`;
      },
    },
    {
      name: 'catalogo',
      label: 'Catálogo de produtos',
      run: async () => {
        const total = countProducts(await bundle());
        if (total < 1) throw new Error('nenhum produto no catálogo');
        return `${total} produtos`;
      },
    },
    {
      name: 'imagens',
      label: 'Imagens dos produtos',
      run: async () => {
        const path = findProductImage(await bundle());
        if (!path) throw new Error('nenhuma imagem de produto encontrada');
        const res = await get(path);
        if (!res.ok || !res.type.startsWith('image/')) throw new Error(`${path} respondeu HTTP ${res.status} (${res.type || 'sem tipo'})`);
        return `${path.split('/').pop()} carregou`;
      },
    },
  ];
}

/** Roda as conferências escolhidas (todas, se `only` vier vazio), cada uma com seu tempo. */
export async function runProbes(probes, only = []) {
  const unknown = only.filter((name) => !probes.some((p) => p.name === name));
  if (unknown.length) throw new Error(`conferência desconhecida: ${unknown.join(', ')} (opções: ${probes.map((p) => p.name).join(', ')})`);
  const selected = only.length ? probes.filter((p) => only.includes(p.name)) : probes;
  return Promise.all(
    selected.map(async (probe) => {
      const started = performance.now();
      try {
        const detail = await probe.run();
        return { name: probe.name, label: probe.label, ok: true, detail, ms: Math.round(performance.now() - started) };
      } catch (error) {
        const detail = error?.name === 'TimeoutError' ? 'tempo esgotado' : error?.message ?? String(error);
        return { name: probe.name, label: probe.label, ok: false, detail, ms: Math.round(performance.now() - started) };
      }
    }),
  );
}
