import { BasePage } from './base.page';
import type { CustomerInfo } from '../data/checkout';
import { parsePrice } from '../helpers/money';

/** As três etapas do checkout: dados do cliente, resumo e confirmação. */
export class CheckoutPage extends BasePage {
  protected readonly path = '/checkout-step-one.html';

  // Etapa 1 — dados do cliente
  readonly firstNameInput = this.byTestId('firstName');
  readonly lastNameInput = this.byTestId('lastName');
  readonly postalCodeInput = this.byTestId('postalCode');
  readonly continueButton = this.byTestId('continue');
  readonly errorMessage = this.byTestId('error');

  // Etapa 2 — resumo
  readonly summaryItems = this.byTestId('inventory-item-name');
  readonly subtotalLabel = this.byTestId('subtotal-label');
  readonly taxLabel = this.byTestId('tax-label');
  readonly totalLabel = this.byTestId('total-label');
  readonly finishButton = this.byTestId('finish');

  // Etapa 3 — confirmação
  readonly completeHeader = this.byTestId('complete-header');
  readonly backHomeButton = this.byTestId('back-to-products');

  async fillCustomerInfo(info: CustomerInfo): Promise<void> {
    await this.firstNameInput.fill(info.firstName);
    await this.lastNameInput.fill(info.lastName);
    await this.postalCodeInput.fill(info.postalCode);
    await this.continueButton.click();
  }

  async totals(): Promise<{ subtotal: number; tax: number; total: number }> {
    return {
      subtotal: parsePrice(await this.subtotalLabel.innerText()),
      tax: parsePrice(await this.taxLabel.innerText()),
      total: parsePrice(await this.totalLabel.innerText()),
    };
  }

  async finish(): Promise<void> {
    await this.finishButton.click();
  }
}
