/** Los cinco colores de Magic en su orden canónico (WUBRG). */
export const MANA_COLORS = ['W', 'U', 'B', 'R', 'G'] as const;

/** Sin repetidos y en orden WUBRG, que es como se leen y se muestran. */
export function sortColors(colors: string[]): string[] {
  const order: readonly string[] = MANA_COLORS;
  return [...new Set(colors)].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}
