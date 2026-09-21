/**
 * Etiquetas sin espacios sobrantes, en minúsculas y sin repetir: "cEDH" y " cedh " son la
 * misma. Lo que no sea un array de textos se deja tal cual para que la validación lo rechace.
 *
 * Para `@Transform`: lo usan las etiquetas de un mazo y las de cada carta dentro de él.
 */
export const normalizeTags = ({ value }: { value: unknown }) => {
  if (!Array.isArray(value) || !value.every((tag) => typeof tag === 'string')) return value;
  const tags = (value as string[]).map((tag) => tag.trim().replace(/\s+/g, ' ').toLowerCase());
  return [...new Set(tags)];
};
