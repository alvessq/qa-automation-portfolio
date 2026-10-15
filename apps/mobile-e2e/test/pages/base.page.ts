import type { ChainablePromiseElement } from 'webdriverio';
import { APP_PACKAGE } from '../config/env';

export type Element = ChainablePromiseElement;

/**
 * Base de todos os Page Objects.
 *
 * Estratégia de seletores, em ordem de preferência:
 *   1. resource-id (estável, definido pelo time do app)
 *   2. accessibility id / content-desc (também serve à acessibilidade)
 *   3. texto visível (último recurso, quebra com tradução/cópia)
 */
export abstract class BasePage {
  /** Elemento que prova que a tela carregou. */
  protected abstract get screenAnchor(): Element;

  async waitForScreen(timeout?: number): Promise<this> {
    await this.screenAnchor.waitForDisplayed({
      timeout,
      timeoutMsg: `${this.constructor.name} não carregou`,
    });
    return this;
  }

  async isOnScreen(): Promise<boolean> {
    return this.isVisible(this.screenAnchor);
  }

  protected byId(resourceId: string): Element {
    return $(`id=${APP_PACKAGE}:id/${resourceId}`);
  }

  protected allById(resourceId: string) {
    return $$(`id=${APP_PACKAGE}:id/${resourceId}`);
  }

  protected byAccessibilityId(label: string): Element {
    return $(`~${label}`);
  }

  protected byText(text: string): Element {
    return $(`android=new UiSelector().text("${text}")`);
  }

  protected async tap(element: Element): Promise<void> {
    await element.waitForDisplayed();
    await element.click();
  }

  protected async fill(element: Element, value: string): Promise<void> {
    await element.waitForDisplayed();
    await element.clearValue();
    if (value) await element.setValue(value);
  }

  protected async isVisible(element: Element): Promise<boolean> {
    return element.isDisplayed().catch(() => false);
  }

  /** Texto com espaços normalizados (o app usa espaços não quebráveis em preços). */
  protected async textOf(element: Element): Promise<string> {
    await element.waitForDisplayed();
    return (await element.getText()).replace(/\s+/g, ' ').trim();
  }

  protected async textsOf(resourceId: string): Promise<string[]> {
    const elements = await this.allById(resourceId);
    const texts: string[] = [];
    for (const element of elements) {
      texts.push((await element.getText()).replace(/\s+/g, ' ').trim());
    }
    return texts;
  }
}
