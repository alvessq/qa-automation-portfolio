import { useCallback, useEffect, useState } from 'react';

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body ? { 'content-type': 'application/json', ...init.headers } : init?.headers,
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  if (response.status === 204 || response.status === 202) {
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
  return response.json() as Promise<T>;
}

export const send = <T = unknown>(method: string, path: string, body?: unknown) =>
  api<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

export async function text(path: string): Promise<string> {
  const response = await fetch(path);
  return response.text();
}

/**
 * Busca `path` e repete a cada `intervalMs`. Com intervalo <= 0 busca uma vez
 * e para: usado nas abas que não estão visíveis. Com `path` null não busca nada.
 */
export function usePolling<T>(path: string | null, intervalMs = 5000) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!path) return;
    try {
      setData(await api<T>(path));
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [path]);
  useEffect(() => {
    void load();
    if (intervalMs <= 0) return;
    const timer = window.setInterval(() => void load(), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs, load]);
  return { data, error, reload: load };
}

/** Executa uma ação e devolve a mensagem de erro (ou '') para mostrar no painel. */
export async function attempt(action: () => Promise<unknown>): Promise<string> {
  try {
    await action();
    return '';
  } catch (cause) {
    return cause instanceof Error ? cause.message : String(cause);
  }
}
