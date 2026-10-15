import path from 'node:path';
import dotenv from 'dotenv';

export const WORKSPACE_DIR = path.resolve(import.meta.dirname, '..', '..');

dotenv.config({ path: path.join(WORKSPACE_DIR, '.env'), quiet: true });

export function env(name: string, fallback = ''): string {
  const value = process.env[name]?.trim();
  return value ? value : fallback;
}

export const BASE_URL = env('BASE_URL', 'https://www.saucedemo.com');

export const AUTH_STATE_FILE = path.join(WORKSPACE_DIR, '.auth', 'standard-user.json');
