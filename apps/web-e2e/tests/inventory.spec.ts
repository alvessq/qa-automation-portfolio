import { test, expect } from '../src/fixtures/test';
import { CATALOG_SIZE, products } from '../src/data/products';

test.describe('Inventário', () => {
  test.beforeEach(async ({ inventoryPage }) => {
    await inventoryPage.goto();
  });

  test('lista todos os produtos do catálogo', { tag: '@smoke' }, async ({ inventoryPage }) => {
    await expect(inventoryPage.title).toHaveText('Products');
    await expect(inventoryPage.items).toHaveCount(CATALOG_SIZE);
  });

  test('ordena por nome de Z a A', async ({ inventoryPage }) => {
    await inventoryPage.sortBy('za');

    const names = await inventoryPage.productNames();
    expect(names).toEqual([...names].sort().reverse());
  });

  test('ordena por preço do menor para o maior', async ({ inventoryPage }) => {
    await inventoryPage.sortBy('lohi');

    const prices = await inventoryPage.productPrices();
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(prices[0]).toBe(products.onesie.price);
  });

  test('ordena por preço do maior para o menor', async ({ inventoryPage }) => {
    await inventoryPage.sortBy('hilo');

    const prices = await inventoryPage.productPrices();
    expect(prices).toEqual([...prices].sort((a, b) => b - a));
    expect(prices[0]).toBe(products.fleeceJacket.price);
  });

  test('abre os detalhes de um produto', async ({ page, inventoryPage }) => {
    await inventoryPage.openProduct(products.backpack.name);

    await expect(page).toHaveURL(/inventory-item\.html\?id=\d+/);
    await expect(page.getByTestId('inventory-item-name')).toHaveText(products.backpack.name);
    await expect(page.getByTestId('inventory-item-price')).toHaveText(`$${products.backpack.price}`);
  });

  test('encerra a sessão pelo menu lateral', async ({ page, inventoryPage, loginPage }) => {
    await inventoryPage.header.logout();

    await expect(page).toHaveURL(/\/$/);
    await expect(loginPage.loginButton).toBeVisible();
  });
});
