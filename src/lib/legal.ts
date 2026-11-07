/** The legal pages, served at /legal/<doc>. */
export const LEGAL_DOCS = [
  "terms",
  "privacy",
  "cookies",
  "affiliates",
] as const;
export type LegalDoc = (typeof LEGAL_DOCS)[number];

export function isLegalDoc(value: string): value is LegalDoc {
  return (LEGAL_DOCS as readonly string[]).includes(value);
}
