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
  await waitForCatalog();
}

/**
 * Espera o catálogo aparecer, fechando diálogos do sistema pelo caminho. Logo
 * depois de abrir, a animação da tela de abertura pode deixar a tela ilegível
 * para o UiAutomator2 por vários segundos (no emulador sem GPU da CI, mais de
 * 10 s, e de forma intermitente). Nesse intervalo as buscas dão erro em vez de
 * "não encontrado", então erro aqui conta como "ainda carregando".
 */
async function waitForCatalog(): Promise<void> {
  await driver.waitUntil(
    async () => {
      try {
        await dismissSystemDialogs();
        return await catalogPage.isOnScreen();
      } catch {
        return false;
      }
    },
    {
      timeout: isCI ? 120_000 : 30_000,
      interval: 1_000,
      timeoutMsg: 'o catálogo não apareceu: o app ficou preso na tela de abertura',
    },
  );
}
