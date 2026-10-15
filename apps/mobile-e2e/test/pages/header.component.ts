import { BasePage } from './base.page';

/** Barra superior compartilhada por catálogo, produto e carrinho. */
class HeaderComponent extends BasePage {
  protected get screenAnchor() {
    return this.byAccessibilityId('View menu');
  }

  private get menuButton() {
    return this.byAccessibilityId('View menu');
  }

  private get cartButton() {
    return this.byAccessibilityId('View cart');
  }

  private get cartBadge() {
    return this.byId('cartTV');
  }

  async openMenu(): Promise<void> {
    await this.tap(this.menuButton);
  }

  async openCart(): Promise<void> {
    await this.tap(this.cartButton);
  }

  /** Quantidade exibida no ícone do carrinho (0 quando o badge não aparece). */
  async cartCount(): Promise<number> {
    if (!(await this.isVisible(this.cartBadge))) return 0;
    return Number(await this.cartBadge.getText());
  }
}

export default new HeaderComponent();
