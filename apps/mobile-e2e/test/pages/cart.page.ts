import { BasePage } from './base.page';
import { parsePrice } from '../helpers/money';

class CartPage extends BasePage {
  protected get screenAnchor() {
    return this.byAccessibilityId('Confirms products for checkout');
  }

  private get itemsCount() {
    return this.byId('itemsTV');
  }

  private get totalPrice() {
    return this.byId('totalPriceTV');
  }

  private get removeButton() {
    return this.byAccessibilityId('Removes product from cart');
  }

  private get proceedButton() {
    return this.byAccessibilityId('Confirms products for checkout');
  }

  private get increaseButton() {
    return this.byAccessibilityId('Increase item quantity');
  }

  private get emptyCartMessage() {
    return this.byText('No Items');
  }

  async productNames(): Promise<string[]> {
    return this.textsOf('titleTV');
  }

  /** Lê "3 Items" / "1 Item" e devolve o número. */
  async getItemsCount(): Promise<number> {
    return Number((await this.textOf(this.itemsCount)).split(' ')[0]);
  }

  async getTotal(): Promise<number> {
    return parsePrice(await this.textOf(this.totalPrice));
  }

  async increaseFirstItem(): Promise<void> {
    await this.tap(this.increaseButton);
  }

  async removeFirstItem(): Promise<void> {
    await this.tap(this.removeButton);
  }

  async waitForEmptyCart(): Promise<void> {
    await this.emptyCartMessage.waitForDisplayed({ timeoutMsg: 'carrinho não ficou vazio' });
  }

  async proceedToCheckout(): Promise<void> {
    await this.tap(this.proceedButton);
  }
}

export default new CartPage();
