import { BasePage } from '../base.page';
import type { PaymentCard } from '../../data/checkout';

class PaymentPage extends BasePage {
  protected get screenAnchor() {
    return this.byId('cardNumberET');
  }

  private get reviewButton() {
    return this.byId('paymentBtn');
  }

  async fillCard(card: PaymentCard): Promise<void> {
    await this.fill(this.byId('nameET'), card.holderName);
    await this.fill(this.byId('cardNumberET'), card.number);
    await this.fill(this.byId('expirationDateET'), card.expiration);
    await this.fill(this.byId('securityCodeET'), card.securityCode);
    if (await driver.isKeyboardShown()) await driver.hideKeyboard();
  }

  async reviewOrder(): Promise<void> {
    await this.tap(this.reviewButton);
  }
}

export default new PaymentPage();
