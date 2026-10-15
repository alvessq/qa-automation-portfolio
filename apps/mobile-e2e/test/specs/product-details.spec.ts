import { expect } from '@wdio/globals';
import catalogPage from '../pages/catalog.page';
import header from '../pages/header.component';
import productPage from '../pages/product.page';
import { resetApp } from '../helpers/app.helper';
import { products } from '../data/products';

describe('Detalhes do produto', () => {
  const product = products.backpack;

  beforeEach(async () => {
    await resetApp();
    await catalogPage.openProduct(product);
    await productPage.waitForScreen();
  });

  it('exibe nome e preço do produto selecionado', async () => {
    expect(await productPage.getName()).toBe(product.name);
    expect(await productPage.getPrice()).toBe(product.price);
  });

  it('ajusta a quantidade antes de adicionar ao carrinho', async () => {
    expect(await productPage.getQuantity()).toBe(1);

    await productPage.setQuantity(3);
    expect(await productPage.getQuantity()).toBe(3);

    await productPage.setQuantity(2);
    expect(await productPage.getQuantity()).toBe(2);
  });

  it('atualiza o badge do carrinho com a quantidade adicionada', async () => {
    await productPage.addToCart(2);
    expect(await header.cartCount()).toBe(2);
  });
});
