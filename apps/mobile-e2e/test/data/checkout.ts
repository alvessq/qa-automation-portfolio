export interface ShippingAddress {
  fullName: string;
  address1: string;
  address2?: string;
  city: string;
  state?: string;
  zip: string;
  country: string;
}

export interface PaymentCard {
  holderName: string;
  number: string;
  expiration: string;
  securityCode: string;
}

/** Sufixo curto para deixar cada massa identificável nos logs e vídeos. */
const runId = () => Date.now().toString(36).slice(-5).toUpperCase();

/**
 * Factories de massa: geram dados válidos por padrão e aceitam sobrescritas,
 * assim cada teste declara só o que importa para o seu cenário.
 */
export function buildShippingAddress(overrides: Partial<ShippingAddress> = {}): ShippingAddress {
  return {
    fullName: `QA Tester ${runId()}`,
    address1: 'Avenida Paulista 1000',
    address2: 'Apto 42',
    city: 'Sao Paulo',
    state: 'SP',
    zip: '01310100',
    country: 'Brazil',
    ...overrides,
  };
}

export function buildPaymentCard(overrides: Partial<PaymentCard> = {}): PaymentCard {
  return {
    holderName: 'QA Tester',
    // Número fictício: o app de demonstração não processa pagamentos reais.
    number: '4111111111111111',
    expiration: '1230',
    securityCode: '123',
    ...overrides,
  };
}

export const checkoutMessages = {
  orderComplete: 'Checkout Complete',
  fullNameRequired: 'Please provide your full name.',
  addressRequired: 'Please provide your address.',
  cityRequired: 'Please provide your city.',
};
