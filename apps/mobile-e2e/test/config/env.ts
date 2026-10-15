import path from 'node:path';
import dotenv from 'dotenv';

export const WORKSPACE_DIR = path.resolve(import.meta.dirname, '..', '..');

dotenv.config({ path: path.join(WORKSPACE_DIR, '.env'), quiet: true });

export const APP_PACKAGE = 'com.saucelabs.mydemoapp.android';

export const RESULTS_DIR = path.join(WORKSPACE_DIR, 'test-results');

export const isCI = process.env.CI === 'true';

export function env(name: string, fallback = ''): string {
  const value = process.env[name]?.trim();
  return value ? value : fallback;
}

export function envFlag(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  return value === 'true' || value === '1';
}
