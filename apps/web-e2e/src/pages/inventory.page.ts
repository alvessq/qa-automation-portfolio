import { BasePage } from './base.page';
import { HeaderComponent } from './header.component';
import { parsePrice } from '../helpers/money';

export type SortOption = 'az' | 'za' | 'lohi' | 'hilo';

export class InventoryPage extends BasePage {
  protected readonly path = '/inventory.html';

  readonly header = new HeaderComponent(this.page);
  readonly title = this.byTestId('title');
  readonly items = this.byTestId('inventory-item');
  readonly sortSelect = this.byTestId('product-sort-container');

  async sortBy(option: SortOption): Promise<void> {
    await this.sortSelect.selectOption(option);
  }

  async productNames(): Promise<string[]> {
    return this.byTestId('inventory-item-name').allInnerTexts();
  }

  async productPrices(): Promise<number[]> {
    return (await this.byTestId('inventory-item-price').allInnerTexts()).map(parsePrice);
  }

  async addToCart(productName: string): Promise<void> {
    await this.byTestId(`add-to-cart-${this.slug(productName)}`).click();
  }

  removeButton(productName: string) {
    return this.byTestId(`remove-${this.slug(productName)}`);
  }

  async openProduct(productName: string): Promise<void> {
    await this.byTestId('inventory-item-name').filter({ hasText: productName }).click();
  }
}
