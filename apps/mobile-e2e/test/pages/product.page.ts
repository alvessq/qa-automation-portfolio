import { BasePage } from './base.page';
import { parsePrice } from '../helpers/money';

class ProductPage extends BasePage {
  protected get screenAnchor() {
    return this.byAccessibilityId('Tap to add product to cart');
  }

  private get name() {
    return this.byId('productTV');
  }

  private get price() {
    return this.byId('priceTV');
  }

  private get quantity() {
    return this.byId('noTV');
  }

  private get increaseButton() {
    return this.byAccessibilityId('Increase item quantity');
  }

  private get decreaseButton() {
    return this.byAccessibilityId('Decrease item quantity');
  }

  private get addToCartButton() {
    return this.byAccessibilityId('Tap to add product to cart');
  }

  async getName(): Promise<string> {
    return this.textOf(this.name);
  }

  async getPrice(): Promise<number> {
    return parsePrice(await this.textOf(this.price));
  }

  async getQuantity(): Promise<number> {
    return Number(await this.textOf(this.quantity));
  }

  async setQuantity(target: number): Promise<void> {
    let current = await this.getQuantity();
    while (current < target) {
      await this.tap(this.increaseButton);
      current++;
    }
    while (current > target) {
      await this.tap(this.decreaseButton);
      current--;
    }
  }

  async addToCart(quantity = 1): Promise<void> {
    await this.setQuantity(quantity);
    await this.tap(this.addToCartButton);
  }
}

export default new ProductPage();
