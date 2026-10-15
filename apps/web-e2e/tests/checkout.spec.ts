import { test, expect } from '../src/fixtures/test';
import { buildCustomer, checkoutMessages, type CustomerInfo } from '../src/data/checkout';
import { products } from '../src/data/products';
import { sumPrices } from '../src/helpers/money';

test.describe('Checkout', () => {
  test.beforeEach(async ({ inventoryPage, cartPage }) => {
    await inventoryPage.goto();
    await inventoryPage.addToCart(products.backpack.name);
    await inventoryPage.addToCart(products.boltTShirt.name);
    await inventoryPage.header.openCart();
    await cartPage.checkout();
  });

  test('conclui a compra e confere os totais', { tag: '@smoke' }, async ({ page, checkoutPage, inventoryPage }) => {
    await checkoutPage.fillCustomerInfo(buildCustomer());

    await expect(page).toHaveURL(/checkout-step-two\.html/);
    await expect(checkoutPage.summaryItems).toHaveText([products.backpack.name, products.boltTShirt.name]);

    const { subtotal, tax, total } = await checkoutPage.totals();
    expect(subtotal).toBe(sumPrices(products.backpack.price, products.boltTShirt.price));
    expect(total).toBe(sumPrices(subtotal, tax));

    await checkoutPage.finish();

    await expect(checkoutPage.completeHeader).toHaveText(checkoutMessages.complete);
    await expect(inventoryPage.header.cartBadge).toBeHidden();
  });

  const missingFields: Array<{ field: string; overrides: Partial<CustomerInfo>; error: string }> = [
    { field: 'nome', overrides: { firstName: '' }, error: checkoutMessages.firstNameRequired },
    { field: 'sobrenome', overrides: { lastName: '' }, error: checkoutMessages.lastNameRequired },
    { field: 'CEP', overrides: { postalCode: '' }, error: checkoutMessages.postalCodeRequired },
  ];

  for (const { field, overrides, error } of missingFields) {
    test(`exige o campo ${field}`, async ({ page, checkoutPage }) => {
      await checkoutPage.fillCustomerInfo(buildCustomer(overrides));

      await expect(checkoutPage.errorMessage).toHaveText(error);
      await expect(page).toHaveURL(/checkout-step-one\.html/);
    });
  }
});
