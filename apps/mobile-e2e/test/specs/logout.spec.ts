import { expect } from '@wdio/globals';
import header from '../pages/header.component';
import loginPage from '../pages/login.page';
import menuPage from '../pages/menu.page';
import { resetApp } from '../helpers/app.helper';
import { loginAs } from '../helpers/flows';
import { users } from '../data/users';

describe('Logout', () => {
  beforeEach(async () => {
    await resetApp();
    await loginAs(users.standard);
  });

  it('encerra a sessão e volta a oferecer o login no menu', async () => {
    await header.openMenu();
    await menuPage.logout();

    await loginPage.waitForScreen();

    await header.openMenu();
    expect(await menuPage.isLoggedIn()).toBe(false);
  });
});
