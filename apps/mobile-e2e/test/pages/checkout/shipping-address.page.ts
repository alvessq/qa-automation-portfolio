import { BasePage } from '../base.page';
import type { ShippingAddress } from '../../data/checkout';

export type AddressField = 'fullName' | 'address1' | 'city' | 'zip' | 'country';

class ShippingAddressPage extends BasePage {
  protected get screenAnchor() {
    return this.byAccessibilityId('Saves user info for checkout');
  }

  private get continueButton() {
    return this.byAccessibilityId('Saves user info for checkout');
  }

  async fillAddress(address: ShippingAddress): Promise<void> {
    await this.fill(this.byId('fullNameET'), address.fullName);
    await this.fill(this.byId('address1ET'), address.address1);
    await this.fill(this.byId('address2ET'), address.address2 ?? '');
    await this.fill(this.byId('cityET'), address.city);
    await this.fill(this.byId('stateET'), address.state ?? '');
    await this.fill(this.byId('zipET'), address.zip);
    await this.fill(this.byId('countryET'), address.country);
    if (await driver.isKeyboardShown()) await driver.hideKeyboard();
  }

  async continueToPayment(): Promise<void> {
    await this.tap(this.continueButton);
  }

  async getFieldError(field: AddressField): Promise<string> {
    return this.textOf(this.byId(`${field}ErrorTV`));
  }
}

export default new ShippingAddressPage();
