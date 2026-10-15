import { env } from '../config/env';

export interface Credentials {
  username: string;
  password: string;
}

const password = env('SAUCE_PASSWORD', 'secret_sauce');

/** Credenciais públicas exibidas na própria tela de login do Sauce Demo. */
export const users = {
  standard: { username: env('SAUCE_STANDARD_USER', 'standard_user'), password },
  lockedOut: { username: env('SAUCE_LOCKED_USER', 'locked_out_user'), password },
  invalidPassword: { username: env('SAUCE_STANDARD_USER', 'standard_user'), password: 'wrong_password' },
} satisfies Record<string, Credentials>;

export const loginErrors = {
  lockedOut: 'Epic sadface: Sorry, this user has been locked out.',
  invalid: 'Epic sadface: Username and password do not match any user in this service',
  usernameRequired: 'Epic sadface: Username is required',
  passwordRequired: 'Epic sadface: Password is required',
};
