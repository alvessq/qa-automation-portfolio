import { BasePage } from '../base.page';

class CheckoutCompletePage extends BasePage {
  protected get screenAnchor() {
    return this.byId('completeTV');
  }

  private get continueShoppingButton() {
    return this.byAccessibilityId('Tap to open catalog');
  }

  async getHeadline(): Promise<string> {
    return this.textOf(this.screenAnchor);
  }

  async continueShopping(): Promise<void> {
    await this.tap(this.continueShoppingButton);
  }
}

export default new CheckoutCompletePage();
