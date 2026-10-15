import { expect } from '@wdio/globals';
import cartPage from '../pages/cart.page';
import header from '../pages/header.component';
import { resetApp } from '../helpers/app.helper';
import { addProductToCart } from '../helpers/flows';
import { sumPrices } from '../helpers/money';
import { products } from '../data/products';

describe('Carrinho', () => {
  beforeEach(async () => {
    await resetApp();
  });

  it('lista os produtos adicionados e soma o total', async () => {
    await addProductToCart(products.backpack);
    await addProductToCart(products.onesie, 2);

    await header.openCart();
    await cartPage.waitForScreen();

    // O badge é conferido aqui e não no catálogo: lá ele não atualiza ao voltar
    // da tela de produto (bug do app, ver README > Bugs encontrados).
    expect(await header.cartCount()).toBe(3);
    expect(await cartPage.productNames()).toEqual(
      expect.arrayContaining([products.backpack.name, products.onesie.name]),
    );
    expect(await cartPage.getItemsCount()).toBe(3);
    expect(await cartPage.getTotal()).toBe(
      sumPrices(products.backpack.price, products.onesie.price, products.onesie.price),
    );
  });

  it('recalcula o total ao aumentar a quantidade no carrinho', async () => {
    await addProductToCart(products.onesie);
    await header.openCart();
    await cartPage.waitForScreen();

    await cartPage.increaseFirstItem();

    expect(await cartPage.getItemsCount()).toBe(2);
    expect(await cartPage.getTotal()).toBe(sumPrices(products.onesie.price, products.onesie.price));
  });

  it('remove o produto e mostra o carrinho vazio', async () => {
    await addProductToCart(products.fleeceJacket);
    await header.openCart();
    await cartPage.waitForScreen();

    await cartPage.removeFirstItem();

    await cartPage.waitForEmptyCart();
    expect(await header.cartCount()).toBe(0);
  });
});
