import { expect } from '@wdio/globals';
import catalogPage from '../pages/catalog.page';
import header from '../pages/header.component';
import loginPage from '../pages/login.page';
import menuPage from '../pages/menu.page';
import { resetApp } from '../helpers/app.helper';
import { loginAs } from '../helpers/flows';
import { loginMessages, users } from '../data/users';

describe('Login', () => {
  beforeEach(async () => {
    await resetApp();
  });

  it('autentica um usuário válido e volta ao catálogo', async () => {
    await loginAs(users.standard);

    await header.openMenu();
    expect(await menuPage.isLoggedIn()).toBe(true);
  });

  describe('validações', () => {
    beforeEach(async () => {
      await header.openMenu();
      await menuPage.goToLogin();
      await loginPage.waitForScreen();
    });

    it('bloqueia usuário com acesso suspenso', async () => {
      await loginPage.submit(users.lockedOut);

      expect(await loginPage.getPasswordError()).toBe(loginMessages.lockedOut);
      expect(await catalogPage.isOnScreen()).toBe(false);
    });

    it('exige o usuário', async () => {
      await loginPage.submit(users.empty);
      expect(await loginPage.getUsernameError()).toBe(loginMessages.usernameRequired);
    });

    it('exige a senha', async () => {
      await loginPage.submit(users.withoutPassword);
      expect(await loginPage.getPasswordError()).toBe(loginMessages.passwordRequired);
    });
  });
});
