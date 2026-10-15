import { env } from '../config/env';

export interface Credentials {
  username: string;
  password: string;
}

/**
 * Usuários de teste. Os valores padrão são as credenciais públicas exibidas na
 * própria tela de login do My Demo App; podem ser sobrescritos via .env/secrets.
 */
export const users = {
  standard: {
    username: env('MDA_STANDARD_USER', 'bod@example.com'),
    password: env('MDA_STANDARD_PASSWORD', '10203040'),
  },
  lockedOut: {
    username: env('MDA_LOCKED_USER', 'alice@example.com'),
    password: env('MDA_STANDARD_PASSWORD', '10203040'),
  },
  withoutPassword: {
    username: env('MDA_STANDARD_USER', 'bod@example.com'),
    password: '',
  },
  empty: { username: '', password: '' },
} satisfies Record<string, Credentials>;

export const loginMessages = {
  usernameRequired: 'Username is required',
  passwordRequired: 'Enter Password',
  lockedOut: 'Sorry this user has been locked out.',
};
