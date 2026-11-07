import { ALPHA3_TO_ALPHA2 } from "../../../supabase/functions/_shared/ingest/countries";
import { countryName, languageName } from "./format";
import type { FeedFacets } from "./queries";

/**
 * Filter options with display names resolved once, on the server. Names come
 * from Intl, whose data differs between Node and browsers, so computing them
 * in client components would cause hydration mismatches.
 */
export interface FilterOptions {
  platforms: FeedFacets["platforms"];
  domains: FeedFacets["domains"];
  languages: { value: string; name: string; count: number }[];
  countries: { code: string; name: string }[];
}

export const COUNTRY_CODES = [...new Set(Object.values(ALPHA3_TO_ALPHA2))];

export function buildFilterOptions(
  facets: FeedFacets,
  locale: string,
): FilterOptions {
  return {
    platforms: facets.platforms,
    domains: facets.domains,
    languages: facets.languages.map((l) => ({
      ...l,
      name: languageName(l.value, locale),
    })),
    countries: COUNTRY_CODES.map((code) => ({
      code,
      name: countryName(code, locale),
    })).sort((a, b) => a.name.localeCompare(b.name, locale)),
  };
}
