import { BasePage } from './base.page';
import type { Credentials } from '../data/users';

class LoginPage extends BasePage {
  protected get screenAnchor() {
    return this.byAccessibilityId('Tap to login with given credentials');
  }

  private get usernameInput() {
    return this.byId('nameET');
  }

  private get passwordInput() {
    return this.byId('passwordET');
  }

  private get loginButton() {
    return this.byAccessibilityId('Tap to login with given credentials');
  }

  private get usernameError() {
    return this.byId('nameErrorTV');
  }

  private get passwordError() {
    return this.byId('passwordErrorTV');
  }

  async submit({ username, password }: Credentials): Promise<void> {
    await this.fill(this.usernameInput, username);
    await this.fill(this.passwordInput, password);
    if (await driver.isKeyboardShown()) await driver.hideKeyboard();
    await this.tap(this.loginButton);
  }

  async getUsernameError(): Promise<string> {
    return this.textOf(this.usernameError);
  }

  async getPasswordError(): Promise<string> {
    return this.textOf(this.passwordError);
  }
}

export default new LoginPage();
