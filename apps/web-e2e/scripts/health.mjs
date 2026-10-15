// Health check do site alvo, uma conferência por serviço:
//   npm run health                     todas
//   npm run health -- imagens catalogo só as escolhidas
// Sai com código 1 se qualquer conferência falhar, para o agendador e a CI.
import 'dotenv/config';
import { createProbes, runProbes } from './lib/probes.mjs';

const baseUrl = process.env.BASE_URL || 'https://www.saucedemo.com';
const timeoutMs = Number(process.env.HEALTH_TIMEOUT_MS) || 15_000;

try {
  const results = await runProbes(createProbes({ baseUrl, timeoutMs }), process.argv.slice(2));
  console.log(`Health de ${baseUrl}`);
  for (const r of results) {
    console.log(`${r.ok ? '✔' : '✖'} ${r.label.padEnd(36)} ${String(r.ms).padStart(5)} ms  ${r.detail}`);
  }
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.error(`✖ ${baseUrl} indisponível: ${failed.map((r) => `${r.name} (${r.detail})`).join('; ')}`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
  // exitCode em vez de process.exit(): deixa o Node fechar os sockets antes de sair.
  process.exitCode = 1;
}
