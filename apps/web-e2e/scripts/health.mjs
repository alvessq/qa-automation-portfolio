// Health check rápido do site alvo: responde, dentro do tempo, com a aplicação de login?
// Sai com código 1 em caso de falha, para ser usado pelo agendador e pela CI.
import 'dotenv/config';

const baseUrl = process.env.BASE_URL || 'https://www.saucedemo.com';
const timeoutMs = Number(process.env.HEALTH_TIMEOUT_MS) || 15_000;

async function check() {
  const startedAt = performance.now();
  const response = await fetch(baseUrl, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
  const html = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  // O Sauce Demo é uma SPA: o HTML inicial só referencia o bundle JS, então
  // validamos também que o bundle carrega e contém o formulário de login.
  const bundlePath = /<script[^>]+src="([^"]+\.js)"/.exec(html)?.[1];
  if (!bundlePath) throw new Error('HTML sem bundle JavaScript');

  const bundle = await fetch(new URL(bundlePath, baseUrl), { signal: AbortSignal.timeout(timeoutMs) });
  const source = await bundle.text();
  if (!bundle.ok) throw new Error(`bundle ${bundlePath} respondeu HTTP ${bundle.status}`);
  if (!source.includes('login-button')) throw new Error(`bundle ${bundlePath} sem o formulário de login`);

  return { status: response.status, elapsed: Math.round(performance.now() - startedAt) };
}

try {
  const { status, elapsed } = await check();
  console.log(`✔ ${baseUrl} saudável — HTTP ${status} em ${elapsed} ms`);
} catch (error) {
  console.error(`✖ ${baseUrl} indisponível: ${error instanceof Error ? error.message : String(error)}`);
  // exitCode em vez de process.exit(): deixa o Node fechar os sockets antes de sair.
  process.exitCode = 1;
}
