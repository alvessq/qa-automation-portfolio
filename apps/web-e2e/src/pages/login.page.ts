import { BasePage } from './base.page';
import type { Credentials } from '../data/users';

export class LoginPage extends BasePage {
  protected readonly path = '/';

  readonly usernameInput = this.byTestId('username');
  readonly passwordInput = this.byTestId('password');
  readonly loginButton = this.byTestId('login-button');
  readonly errorMessage = this.byTestId('error');

  async login({ username, password }: Credentials): Promise<void> {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }
}
