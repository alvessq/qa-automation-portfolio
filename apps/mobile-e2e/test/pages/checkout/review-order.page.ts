import { BasePage } from '../base.page';
import { parsePrice } from '../../helpers/money';

class ReviewOrderPage extends BasePage {
  protected get screenAnchor() {
    return this.byAccessibilityId('Completes the process of checkout');
  }

  private get placeOrderButton() {
    return this.byAccessibilityId('Completes the process of checkout');
  }

  private get totalPrice() {
    return this.byId('totalAmountTV');
  }

  async productNames(): Promise<string[]> {
    return this.textsOf('titleTV');
  }

  async getTotal(): Promise<number> {
    return parsePrice(await this.textOf(this.totalPrice));
  }

  async placeOrder(): Promise<void> {
    await this.tap(this.placeOrderButton);
  }
}

export default new ReviewOrderPage();
