/**
 * Detects work languages named in listing text ("Bilingual Japanese
 * Psychiatrist", "Spanish Legal Expert"). Neither Mercor nor micro1 has a
 * language field, so the title and skills are the only signal.
 *
 * Matching is case-sensitive on capitalised whole words, so "polish your
 * writing" does not read as Polish.
 */
const LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  Afrikaans: "af",
  Albanian: "sq",
  Amharic: "am",
  Arabic: "ar",
  Armenian: "hy",
  Assamese: "as",
  Azerbaijani: "az",
  Basque: "eu",
  Bengali: "bn",
  Bangla: "bn",
  Bosnian: "bs",
  Bulgarian: "bg",
  Burmese: "my",
  Cantonese: "zh",
  Catalan: "ca",
  Chinese: "zh",
  Mandarin: "zh",
  Croatian: "hr",
  Czech: "cs",
  Danish: "da",
  Dutch: "nl",
  English: "en",
  Estonian: "et",
  Filipino: "tl",
  Tagalog: "tl",
  Finnish: "fi",
  French: "fr",
  Georgian: "ka",
  German: "de",
  Greek: "el",
  Gujarati: "gu",
  Hausa: "ha",
  Hebrew: "he",
  Hindi: "hi",
  Hungarian: "hu",
  Icelandic: "is",
  Igbo: "ig",
  Indonesian: "id",
  Irish: "ga",
  Italian: "it",
  Japanese: "ja",
  Javanese: "jv",
  Kannada: "kn",
  Kazakh: "kk",
  Khmer: "km",
  Korean: "ko",
  Lao: "lo",
  Latvian: "lv",
  Lithuanian: "lt",
  Macedonian: "mk",
  Malay: "ms",
  Malayalam: "ml",
  Maltese: "mt",
  Marathi: "mr",
  Mongolian: "mn",
  Nepali: "ne",
  Odia: "or",
  Oriya: "or",
  Norwegian: "no",
  Pashto: "ps",
  Persian: "fa",
  Farsi: "fa",
  Polish: "pl",
  Portuguese: "pt",
  Punjabi: "pa",
  Romanian: "ro",
  Russian: "ru",
  Serbian: "sr",
  Sindhi: "sd",
  Sinhala: "si",
  Slovak: "sk",
  Slovenian: "sl",
  Somali: "so",
  Spanish: "es",
  Swahili: "sw",
  Swedish: "sv",
  Tamil: "ta",
  Telugu: "te",
  Thai: "th",
  Turkish: "tr",
  Ukrainian: "uk",
  Urdu: "ur",
  Uzbek: "uz",
  Vietnamese: "vi",
  Welsh: "cy",
  Xhosa: "xh",
  Yoruba: "yo",
  Zulu: "zu",
};

/** Every ISO 639-1 code we recognise, sorted (for pickers). */
export const LANGUAGE_CODES: readonly string[] = [
  ...new Set(Object.values(LANGUAGE_NAMES)),
].sort();

const PATTERN = new RegExp(
  `\\b(${Object.keys(LANGUAGE_NAMES).join("|")})\\b`,
  "g",
);

/** ISO 639-1 codes of the languages named in the given texts, sorted. */
export function detectLanguages(
  ...texts: readonly (string | null | undefined)[]
): string[] {
  const found = new Set<string>();
  for (const text of texts) {
    for (const match of text?.matchAll(PATTERN) ?? []) {
      const code = LANGUAGE_NAMES[match[1] ?? ""];
      if (code) found.add(code);
    }
  }
  return [...found].sort();
}
