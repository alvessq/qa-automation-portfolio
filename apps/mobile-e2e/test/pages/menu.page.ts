import { BasePage } from './base.page';

class MenuPage extends BasePage {
  protected get screenAnchor() {
    return this.byAccessibilityId('Recycler view for menu');
  }

  private get loginItem() {
    return this.byAccessibilityId('Login Menu Item');
  }

  private get logoutItem() {
    return this.byAccessibilityId('Logout Menu Item');
  }

  /** Botão positivo dos diálogos nativos do Android (ex.: "LOG OUT", "OK"). */
  private get dialogConfirmButton() {
    return $('id=android:id/button1');
  }


  async goToLogin(): Promise<void> {
    await this.waitForScreen();
    await this.tap(this.loginItem);
  }

  async isLoggedIn(): Promise<boolean> {
    await this.waitForScreen();
    return this.isVisible(this.logoutItem);
  }

  /** Faz logout confirmando o diálogo nativo; o app leva para a tela de login. */
  async logout(): Promise<void> {
    await this.waitForScreen();
    await this.tap(this.logoutItem);
    await this.tap(this.dialogConfirmButton);
  }
}

export default new MenuPage();
