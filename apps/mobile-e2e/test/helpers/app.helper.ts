import { APP_PACKAGE, isCI } from '../config/env';
import catalogPage from '../pages/catalog.page';
import { dismissSystemDialogs } from './system-dialogs';

/**
 * Deixa o app como recém-instalado (sem login nem carrinho) e aberto no
 * catálogo. Chamado antes de cada teste para que nenhum cenário dependa do
 * estado deixado por outro.
 */
export async function resetApp(): Promise<void> {
  await driver.execute('mobile: clearApp', { appId: APP_PACKAGE });
  await driver.activateApp(APP_PACKAGE);
  await waitUntilScreenReadable();
  await dismissSystemDialogs();
  await catalogPage.waitForScreen();
}

/**
 * Logo depois de abrir, a animação da tela de abertura pode deixar a tela
 * ilegível para o UiAutomator2 por alguns segundos (no emulador sem GPU da CI,
 * por mais de 10 s). Nesse intervalo, qualquer busca falha com erro em vez de
 * "não encontrado". Espera até a tela poder ser lida antes de procurar algo.
 */
async function waitUntilScreenReadable(): Promise<void> {
  await driver.waitUntil(
    async () => {
      try {
        await driver.getPageSource();
        return true;
      } catch {
        return false;
      }
    },
    {
      timeout: isCI ? 120_000 : 30_000,
      interval: 2_000,
      timeoutMsg: 'a tela do app não pôde ser lida: o app ficou preso na tela de abertura',
    },
  );
}
