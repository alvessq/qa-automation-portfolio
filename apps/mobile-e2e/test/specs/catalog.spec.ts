import { expect } from '@wdio/globals';
import catalogPage from '../pages/catalog.page';
import header from '../pages/header.component';
import { resetApp } from '../helpers/app.helper';
import { isSortedAscending, isSortedDescending } from '../helpers/money';
import { catalogPriceRange, products } from '../data/products';

describe('Catálogo', () => {
  beforeEach(async () => {
    await resetApp();
  });

  it('abre o app no catálogo de produtos com o carrinho vazio', async () => {
    expect(await catalogPage.getTitle()).toBe('Products');
    expect(await catalogPage.visibleProductNames()).not.toHaveLength(0);
    expect(await header.cartCount()).toBe(0);
  });

  it('ordena por nome em ordem alfabética', async () => {
    await catalogPage.sortBy('nameAsc');
    const names = await catalogPage.visibleProductNames();

    expect(names[0]).toBe(products.backpack.name);
    expect(isSortedAscending(names)).toBe(true);
  });

  it('ordena por nome em ordem alfabética inversa', async () => {
    await catalogPage.sortBy('nameDesc');
    expect(isSortedDescending(await catalogPage.visibleProductNames())).toBe(true);
  });

  it('ordena por preço do menor para o maior', async () => {
    await catalogPage.sortBy('priceAsc');
    const prices = await catalogPage.visibleProductPrices();

    expect(prices[0]).toBe(catalogPriceRange.lowest);
    expect(isSortedAscending(prices)).toBe(true);
  });

  it('ordena por preço do maior para o menor', async () => {
    await catalogPage.sortBy('priceDesc');
    const prices = await catalogPage.visibleProductPrices();

    expect(prices[0]).toBe(catalogPriceRange.highest);
    expect(isSortedDescending(prices)).toBe(true);
  });
});
