import { BasePage } from './base.page';
import { APP_PACKAGE } from '../config/env';
import { parsePrice } from '../helpers/money';
import type { Product } from '../data/products';

export type SortOption = 'nameAsc' | 'nameDesc' | 'priceAsc' | 'priceDesc';

const SORT_OPTION_LABELS: Record<SortOption, string> = {
  nameAsc: 'Ascending order by name',
  nameDesc: 'Descending order by name',
  priceAsc: 'Ascending order by price',
  priceDesc: 'Descending order by price',
};

class CatalogPage extends BasePage {
  protected get screenAnchor() {
    return this.byAccessibilityId('Displays all products of catalog');
  }

  private get title() {
    return this.byId('productTV');
  }

  private get sortButton() {
    return this.byAccessibilityId('Shows current sorting order and displays available sorting options');
  }

  async getTitle(): Promise<string> {
    return this.textOf(this.title);
  }

  async sortBy(option: SortOption): Promise<void> {
    await this.tap(this.sortButton);
    await this.tap(this.byAccessibilityId(SORT_OPTION_LABELS[option]));
    await this.waitForScreen();
  }

  /** Nomes dos produtos visíveis na tela (o topo da lista). */
  async visibleProductNames(): Promise<string[]> {
    return this.textsOf('titleTV');
  }

  async visibleProductPrices(): Promise<number[]> {
    return (await this.textsOf('priceTV')).map(parsePrice);
  }

  /**
   * Ordena o catálogo para trazer o produto ao topo e abre seus detalhes.
   * O título não é clicável no app; o toque vai na imagem do mesmo card.
   */
  async openProduct(product: Product): Promise<void> {
    await this.sortBy(product.listedFirstBy);
    const image = $(
      `//*[@resource-id="${APP_PACKAGE}:id/titleTV" and @text="${product.name}"]` +
        `/../*[@resource-id="${APP_PACKAGE}:id/productIV"]`,
    );
    await image.waitForDisplayed({ timeoutMsg: `"${product.name}" não está no topo após ordenar por ${product.listedFirstBy}` });
    await image.click();
  }
}

export default new CatalogPage();
