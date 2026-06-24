/** Builds the Google Maps query string from segmented capture fields. */
export function buildProspectQuery(
  segment: string,
  city: string,
  state: string,
): string {
  const parts = [segment.trim(), "em", city.trim()];
  const uf = state.trim();
  if (uf) parts.push(`- ${uf}`);
  return parts.join(" ");
}
