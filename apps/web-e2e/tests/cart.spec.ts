import { test, expect } from '../src/fixtures/test';
import { products } from '../src/data/products';

test.describe('Carrinho', () => {
  test.beforeEach(async ({ inventoryPage }) => {
    await inventoryPage.goto();
  });

  test('adiciona produtos e atualiza o badge', { tag: '@smoke' }, async ({ inventoryPage, cartPage }) => {
    await inventoryPage.addToCart(products.backpack.name);
    await inventoryPage.addToCart(products.bikeLight.name);

    await expect(inventoryPage.header.cartBadge).toHaveText('2');
    await expect(inventoryPage.removeButton(products.backpack.name)).toBeVisible();

    await inventoryPage.header.openCart();
    expect(await cartPage.productNames()).toEqual([products.backpack.name, products.bikeLight.name]);
  });

  test('remove um produto pelo carrinho', async ({ inventoryPage, cartPage }) => {
    await inventoryPage.addToCart(products.onesie.name);
    await inventoryPage.addToCart(products.boltTShirt.name);
    await inventoryPage.header.openCart();

    await cartPage.remove(products.onesie.name);

    expect(await cartPage.productNames()).toEqual([products.boltTShirt.name]);
    await expect(cartPage.header.cartBadge).toHaveText('1');
  });

  test('mantém o carrinho ao continuar comprando', async ({ page, inventoryPage, cartPage }) => {
    await inventoryPage.addToCart(products.fleeceJacket.name);
    await inventoryPage.header.openCart();

    await cartPage.continueShoppingButton.click();

    await expect(page).toHaveURL(/inventory\.html/);
    await expect(inventoryPage.header.cartBadge).toHaveText('1');
  });
});
