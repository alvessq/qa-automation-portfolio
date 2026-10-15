import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const WORKSPACE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Pasta local onde o Appium guarda os drivers. Fica dentro do workspace (e no
 * .gitignore) para não depender de instalação global nem do ~/.appium.
 */
export const APPIUM_HOME = process.env.APPIUM_HOME || path.join(WORKSPACE_DIR, '.appium');

export function resolveFromWorkspace(relativePath) {
  return path.resolve(WORKSPACE_DIR, relativePath);
}

/**
 * Caminho do executável JS declarado em `bin` de um pacote. Procura subindo a
 * árvore porque o npm workspaces costuma içar as dependências para a raiz.
 */
export function resolvePackageBin(packageName, binName = packageName) {
  for (let dir = WORKSPACE_DIR; ; dir = path.dirname(dir)) {
    const pkgDir = path.join(dir, 'node_modules', packageName);
    const manifest = path.join(pkgDir, 'package.json');
    if (fs.existsSync(manifest)) {
      const { bin } = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      const relative = typeof bin === 'string' ? bin : bin?.[binName];
      if (!relative) throw new Error(`${packageName} não declara o binário "${binName}"`);
      return path.join(pkgDir, relative);
    }
    if (path.dirname(dir) === dir) throw new Error(`${packageName} não instalado. Rode npm install.`);
  }
}
