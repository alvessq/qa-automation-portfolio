import type { Locator, Page } from '@playwright/test';

/**
 * Base dos Page Objects web. Os seletores usam `data-test` (configurado como
 * testIdAttribute), que o Sauce Demo expõe justamente para automação.
 */
export abstract class BasePage {
  /** Caminho relativo ao baseURL. */
  protected abstract readonly path: string;

  constructor(protected readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto(this.path);
  }

  protected byTestId(id: string): Locator {
    return this.page.getByTestId(id);
  }

  /** "Sauce Labs Backpack" -> "sauce-labs-backpack", padrão dos ids de botão do site. */
  protected slug(productName: string): string {
    return productName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
}
