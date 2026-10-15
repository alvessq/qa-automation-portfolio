/** Extrai o valor de textos como "$29.99" ou "Item total: $39.98". */
export function parsePrice(text: string): number {
  const match = /\$\s*([0-9]+(?:\.[0-9]+)?)/.exec(text);
  if (!match) throw new Error(`preço não encontrado em "${text}"`);
  return Number(match[1]);
}

/** Soma valores monetários sem acumular erro de ponto flutuante. */
export function sumPrices(...values: number[]): number {
  return Math.round(values.reduce((total, v) => total + v * 100, 0)) / 100;
}
