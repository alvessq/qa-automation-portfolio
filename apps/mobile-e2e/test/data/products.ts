import type { SortOption } from '../pages/catalog.page';

export interface Product {
  name: string;
  price: number;
  /**
   * Ordenação que coloca o produto no topo do catálogo.
   *
   * Bug conhecido do My Demo App 2.3.0: tocar em um produto abaixo da 6ª
   * posição da lista fecha o app (ArrayIndexOutOfBoundsException em
   * ProductCatalogFragment). Por isso os cenários abrem só produtos que
   * ficam no topo de alguma ordenação. Ver README > Bugs encontrados.
   */
  listedFirstBy: SortOption;
}

export const products = {
  backpack: { name: 'Sauce Labs Backpack', price: 29.99, listedFirstBy: 'nameAsc' },
  fleeceJacket: { name: 'Sauce Labs Fleece Jacket', price: 49.99, listedFirstBy: 'priceDesc' },
  onesie: { name: 'Sauce Labs Onesie', price: 7.99, listedFirstBy: 'priceAsc' },
} satisfies Record<string, Product>;

export const catalogPriceRange = {
  lowest: products.onesie.price,
  highest: products.fleeceJacket.price,
};
