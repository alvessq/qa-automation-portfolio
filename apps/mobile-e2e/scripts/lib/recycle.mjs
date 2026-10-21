// Reciclagem do emulador local. Antes de cada suíte, se o emulador não está
// saudável (offline ou o Android sem terminar de ligar), ele é reiniciado. E em
// sessões longas ele vai ficando lento e acaba travando: reiniciar a cada N
// suítes (sem apagar os dados) evita isso.
// Na CI não se aplica: lá cada execução já começa com um emulador novo.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_EVERY = 3;

/**
 * Decide o que fazer antes da próxima suíte.
 * `count` é quantas suítes já rodaram desde o último reinício.
 */
export function decideRecycle({ enabled = true, ci = false, isEmulator = true, healthy = true, count = 0, every = DEFAULT_EVERY }) {
  if (!enabled) return { action: 'skip', reason: 'desligado (EMULATOR_RECYCLE=false)' };
  if (ci) return { action: 'skip', reason: 'na CI cada execução já usa um emulador novo' };
  if (!isEmulator) return { action: 'skip', reason: 'device físico' };
  if (!healthy) return { action: 'restart', reason: 'o emulador não está saudável' };
  if (every > 0 && count >= every) return { action: 'restart', reason: `${count} suítes desde o último reinício` };
  return { action: 'keep', reason: `${count}/${every} suítes desde o último reinício` };
}

/** Contador por serial, guardado fora do repositório. */
export function createCounter(file = path.join(os.tmpdir(), 'mobile-e2e-emulator-runs.json')) {
  const read = () => {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return {};
    }
  };
  const write = (data) => fs.writeFileSync(file, JSON.stringify(data));
  return {
    get: (serial) => read()[serial] ?? 0,
    increment(serial) {
      const data = read();
      data[serial] = (data[serial] ?? 0) + 1;
      write(data);
      return data[serial];
    },
    reset(serial) {
      const data = read();
      data[serial] = 0;
      write(data);
    },
  };
}
