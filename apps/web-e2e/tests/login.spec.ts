import { test, expect } from '../src/fixtures/test';
import { loginErrors, users } from '../src/data/users';

test.describe('Login', () => {
  test.beforeEach(async ({ loginPage }) => {
    await loginPage.goto();
  });

  test('autentica um usuário válido', { tag: '@smoke' }, async ({ page, loginPage, inventoryPage }) => {
    await loginPage.login(users.standard);

    await expect(page).toHaveURL(/inventory\.html/);
    await expect(inventoryPage.title).toHaveText('Products');
  });

  test('bloqueia usuário com acesso suspenso', async ({ page, loginPage }) => {
    await loginPage.login(users.lockedOut);

    await expect(loginPage.errorMessage).toHaveText(loginErrors.lockedOut);
    await expect(page).not.toHaveURL(/inventory\.html/);
  });

  test('recusa senha incorreta', async ({ loginPage }) => {
    await loginPage.login(users.invalidPassword);
    await expect(loginPage.errorMessage).toHaveText(loginErrors.invalid);
  });

  const requiredFields = [
    { field: 'usuário', credentials: { username: '', password: 'any' }, error: loginErrors.usernameRequired },
    { field: 'senha', credentials: { username: 'any', password: '' }, error: loginErrors.passwordRequired },
  ];

  for (const { field, credentials, error } of requiredFields) {
    test(`exige o campo ${field}`, async ({ loginPage }) => {
      await loginPage.login(credentials);
      await expect(loginPage.errorMessage).toHaveText(error);
    });
  }

  test('impede acesso direto ao inventário sem login', async ({ page, loginPage }) => {
    await page.goto('/inventory.html');

    await expect(page).toHaveURL(/\/$/);
    await expect(loginPage.errorMessage).toContainText("You can only access '/inventory.html' when you are logged in");
  });
});
