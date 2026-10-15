import type { Credentials } from '../data/users';
import type { Product } from '../data/products';
import catalogPage from '../pages/catalog.page';
import header from '../pages/header.component';
import loginPage from '../pages/login.page';
import menuPage from '../pages/menu.page';
import productPage from '../pages/product.page';

/** Fluxos reutilizados por várias specs. Cada um termina numa tela conhecida. */

export async function loginAs(credentials: Credentials): Promise<void> {
  await header.openMenu();
  await menuPage.goToLogin();
  await loginPage.waitForScreen();
  await loginPage.submit(credentials);
  await catalogPage.waitForScreen();
}

export async function addProductToCart(product: Product, quantity = 1): Promise<void> {
  await catalogPage.openProduct(product);
  await productPage.waitForScreen();
  await productPage.addToCart(quantity);
  await driver.back();
  await catalogPage.waitForScreen();
}
