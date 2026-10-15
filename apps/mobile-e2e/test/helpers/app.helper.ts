import { APP_PACKAGE } from '../config/env';
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
  await dismissSystemDialogs();
  await catalogPage.waitForScreen();
}
