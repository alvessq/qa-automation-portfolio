/** Converte "$ 29.99" (ou "$29.99") em 29.99. */
export function parsePrice(text: string): number {
  const value = Number(text.replace(/[^0-9.]/g, ''));
  if (Number.isNaN(value)) throw new Error(`preço inválido: "${text}"`);
  return value;
}

/** Soma valores monetários sem acumular erro de ponto flutuante. */
export function sumPrices(...values: number[]): number {
  return Math.round(values.reduce((total, v) => total + v * 100, 0)) / 100;
}

export function isSortedAscending(values: Array<number | string>): boolean {
  return values.every((v, i) => i === 0 || values[i - 1] <= v);
}

export function isSortedDescending(values: Array<number | string>): boolean {
  return values.every((v, i) => i === 0 || values[i - 1] >= v);
}
