// Segurança por padrão: login do painel (obrigatório fora de localhost, porque
// o painel dispara execuções na máquina) e agenda pausada ao abrir.
import { createHash, timingSafeEqual } from 'node:crypto';

export function isLoopback(host) {
  return ['127.0.0.1', '::1', 'localhost'].includes(String(host).toLowerCase());
}

const digest = (value) => createHash('sha256').update(String(value)).digest();
/** Compara pelo hash para o tempo não depender de onde as strings diferem. */
const safeEqual = (a, b) => timingSafeEqual(digest(a), digest(b));

/** Middleware de HTTP Basic. Sem usuário e senha, deixa passar. */
export function basicAuth({ user, password, realm = 'Test Scheduler' } = {}) {
  const enabled = Boolean(user && password);
  return function auth(req, res, next) {
    if (!enabled) return next();
    const [scheme, encoded] = String(req.headers.authorization ?? '').split(' ');
    if (scheme === 'Basic' && encoded) {
      const decoded = Buffer.from(encoded, 'base64').toString('utf8');
      const separator = decoded.indexOf(':');
      const okUser = safeEqual(decoded.slice(0, separator), user);
      const okPassword = safeEqual(decoded.slice(separator + 1), password);
      if (separator > -1 && okUser && okPassword) return next();
    }
    res.set('WWW-Authenticate', `Basic realm="${realm}", charset="UTF-8"`);
    res.status(401).json({ error: 'login necessário' });
  };
}

/** Recusa subir exposto na rede sem login. Devolve a mensagem de erro ou null. */
export function exposureError(host, { user, password }) {
  if (isLoopback(host) || (user && password)) return null;
  return `HOST=${host} expõe o painel na rede: defina PANEL_USER e PANEL_PASSWORD ou use HOST=127.0.0.1`;
}

/**
 * Pausado por padrão no uso local: abrir o painel não dispara nenhuma suíte.
 * START_PAUSED=false liga a agenda; na CI a agenda nunca começa pausada.
 */
export function startPaused(env) {
  if (env.CI === 'true') return false;
  return env.START_PAUSED !== 'false';
}
