export interface CustomerInfo {
  firstName: string;
  lastName: string;
  postalCode: string;
}

/** Factory de massa: dados válidos por padrão, sobrescreva só o que o cenário exige. */
export function buildCustomer(overrides: Partial<CustomerInfo> = {}): CustomerInfo {
  return {
    firstName: 'QA',
    lastName: `Tester ${Date.now().toString(36).slice(-4).toUpperCase()}`,
    postalCode: '01310-100',
    ...overrides,
  };
}

export const checkoutMessages = {
  complete: 'Thank you for your order!',
  firstNameRequired: 'Error: First Name is required',
  lastNameRequired: 'Error: Last Name is required',
  postalCodeRequired: 'Error: Postal Code is required',
};
