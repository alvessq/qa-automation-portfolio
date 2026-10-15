import { expect } from '@wdio/globals';
import cartPage from '../pages/cart.page';
import header from '../pages/header.component';
import shippingAddressPage from '../pages/checkout/shipping-address.page';
import paymentPage from '../pages/checkout/payment.page';
import reviewOrderPage from '../pages/checkout/review-order.page';
import checkoutCompletePage from '../pages/checkout/checkout-complete.page';
import catalogPage from '../pages/catalog.page';
import { resetApp } from '../helpers/app.helper';
import { addProductToCart, loginAs } from '../helpers/flows';
import { sumPrices } from '../helpers/money';
import { products } from '../data/products';
import { users } from '../data/users';
import { buildPaymentCard, buildShippingAddress, checkoutMessages } from '../data/checkout';

describe('Checkout', () => {
  beforeEach(async () => {
    await resetApp();
    await loginAs(users.standard);
    await addProductToCart(products.fleeceJacket);
    await header.openCart();
    await cartPage.waitForScreen();
    await cartPage.proceedToCheckout();
    await shippingAddressPage.waitForScreen();
  });

  it('conclui a compra de ponta a ponta', async () => {
    await shippingAddressPage.fillAddress(buildShippingAddress());
    await shippingAddressPage.continueToPayment();

    await paymentPage.waitForScreen();
    await paymentPage.fillCard(buildPaymentCard());
    await paymentPage.reviewOrder();

    await reviewOrderPage.waitForScreen();
    expect(await reviewOrderPage.productNames()).toContain(products.fleeceJacket.name);
    // O total da revisão inclui o frete, então só garantimos que cobre os produtos.
    expect(await reviewOrderPage.getTotal()).toBeGreaterThanOrEqual(sumPrices(products.fleeceJacket.price));
    await reviewOrderPage.placeOrder();

    await checkoutCompletePage.waitForScreen();
    expect(await checkoutCompletePage.getHeadline()).toBe(checkoutMessages.orderComplete);

    await checkoutCompletePage.continueShopping();
    await catalogPage.waitForScreen();
    expect(await header.cartCount()).toBe(0);
  });

  it('valida os campos obrigatórios do endereço', async () => {
    await shippingAddressPage.fillAddress(buildShippingAddress({ fullName: '', address1: '', city: '' }));
    await shippingAddressPage.continueToPayment();

    expect(await shippingAddressPage.getFieldError('fullName')).toBe(checkoutMessages.fullNameRequired);
    expect(await shippingAddressPage.getFieldError('address1')).toBe(checkoutMessages.addressRequired);
    expect(await shippingAddressPage.getFieldError('city')).toBe(checkoutMessages.cityRequired);
    expect(await paymentPage.isOnScreen()).toBe(false);
  });
});
