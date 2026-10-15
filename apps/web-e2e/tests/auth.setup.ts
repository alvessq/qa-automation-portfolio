import { test as setup, expect } from '../src/fixtures/test';
import { AUTH_STATE_FILE } from '../src/config/env';
import { users } from '../src/data/users';

// Login feito uma vez por execução; os demais testes reaproveitam a sessão.
setup('autentica o usuário padrão', async ({ page, loginPage, inventoryPage }) => {
  await loginPage.goto();
  await loginPage.login(users.standard);

  await expect(page).toHaveURL(/inventory\.html/);
  await expect(inventoryPage.title).toHaveText('Products');

  await page.context().storageState({ path: AUTH_STATE_FILE });
});
