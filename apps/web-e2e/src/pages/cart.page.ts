import { BasePage } from './base.page';
import { HeaderComponent } from './header.component';

export class CartPage extends BasePage {
  protected readonly path = '/cart.html';

  readonly header = new HeaderComponent(this.page);
  readonly items = this.byTestId('inventory-item');
  readonly checkoutButton = this.byTestId('checkout');
  readonly continueShoppingButton = this.byTestId('continue-shopping');

  async productNames(): Promise<string[]> {
    return this.items.getByTestId('inventory-item-name').allInnerTexts();
  }

  async remove(productName: string): Promise<void> {
    await this.byTestId(`remove-${this.slug(productName)}`).click();
  }

  async checkout(): Promise<void> {
    await this.checkoutButton.click();
  }
}
