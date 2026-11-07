import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { cookies } from "next/headers";

import { IntroBand } from "@/components/intro-band";
import { FeedForm } from "@/components/jobs/feed-form";
import { SaveSearchButton } from "@/components/jobs/save-search-button";
import { JobCard } from "@/components/jobs/job-card";
import { AccountNav } from "@/components/account-nav";
import { SiteHeader } from "@/components/site-header";
import { StateBlock } from "@/components/state-block";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import {
  activeFilterCount,
  type FeedFilters,
  PAGE_SIZE,
  parseFeedFilters,
  toSearchParams,
  withoutFilters,
} from "@/lib/jobs/filters";
import { describeLabels } from "@/lib/alerts/labels";
import { isSearchSaved } from "@/lib/alerts/queries";
import { describeSearch, toSavedFilters } from "@/lib/alerts/saved-search";
import { emailLocale } from "@/lib/email/messages";
import { INTRO_COOKIE } from "@/lib/intro";
import { buildFilterOptions } from "@/lib/jobs/options";
import { getFeedFacets, searchJobs } from "@/lib/jobs/queries";
import { getMatchReasons } from "@/lib/matching/queries";
import { trackedLookup } from "@/lib/tracker/queries";

export type FeedPath = "/" | "/jobs";

/**
 * The job feed: server-rendered, filters in the URL. Shown publicly at "/"
 * (with the welcome intro for visitors) and inside the app at "/jobs".
 */
export async function FeedView({
  params,
  basePath,
}: {
  params: Record<string, string | string[] | undefined>;
  basePath: FeedPath;
}) {
  const filters = parseFeedFilters(params);
  const [t, locale, { jobs, total }, facets, saved, cookieStore] =
    await Promise.all([
      getTranslations("Feed"),
      getLocale(),
      searchJobs(filters),
      getFeedFacets(),
      isSearchSaved(filters),
      cookies(),
    ]);
  // Signed-out visitors on "/" see the introduction until they hide it.
  const showIntro =
    basePath === "/" && saved === null && !cookieStore.has(INTRO_COOKIE);
  const jobIds = jobs.map((job) => job.id);
  const [isTracked, matches] = await Promise.all([
    trackedLookup(jobIds),
    getMatchReasons(jobIds),
  ]);
  const activeCount = activeFilterCount(filters);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (next: FeedFilters) => {
    const query = toSearchParams(next).toString();
    return query ? `${basePath}?${query}` : basePath;
  };
  const pageHref = (page: number) => href({ ...filters, page });
  const clearSearchHref = href({ ...filters, q: "", page: 1 });

  // "Get alerts": the search without sort, page or "posted within".
  const alertQuery = toSearchParams({
    ...filters,
    sort: "newest",
    page: 1,
    posted: null,
  }).toString();
  const platformNames = new Map(facets.platforms.map((p) => [p.slug, p.name]));
  const alertDescription = describeSearch(
    toSavedFilters(filters),
    filters.platforms.map((slug) => platformNames.get(slug) ?? slug),
    await describeLabels(emailLocale(locale)),
  );
  const saveParams = new URLSearchParams(alertQuery);
  saveParams.set("save", "1");
  const saveSignInHref = `/sign-in?next=${encodeURIComponent(`${basePath}?${saveParams.toString()}`)}`;

  return (
    <>
      <SiteHeader>
        <AccountNav />
      </SiteHeader>
      <main
        id="main"
        className="mx-auto w-full max-w-[1400px] px-4 pt-6 pb-16 sm:px-6 lg:px-8"
      >
        {showIntro && (
          <IntroBand
            openJobs={facets.total}
            platforms={new Intl.ListFormat(locale, {
              style: "long",
              type: "conjunction",
            }).format(facets.platforms.map((p) => p.name))}
          />
        )}
        <div
          id="feed"
          className="mt-8 flex scroll-mt-24 flex-wrap items-center justify-between gap-3 first:mt-0"
        >
          <h1 className="font-display text-2xl font-extrabold sm:text-3xl">
            {basePath === "/jobs" ? t("allTitle") : t("title")}
          </h1>
          <SaveSearchButton
            key={alertQuery}
            query={alertQuery}
            description={alertDescription}
            saved={saved}
            signInHref={saveSignInHref}
            autoOpen={params.save === "1"}
          />
        </div>

        {/* Keyed on the query so the uncontrolled fields reset whenever a
            link (clear search, clear filters) changes the URL. */}
        <FeedForm
          key={toSearchParams({ ...filters, page: 1 }).toString()}
          filters={filters}
          options={buildFilterOptions(facets, locale)}
          activeCount={activeCount}
          basePath={basePath}
        >
          <section aria-labelledby="results-heading">
            <div className="flex flex-wrap items-center gap-2">
              <p
                id="results-heading"
                className="text-sm font-semibold"
                aria-live="polite"
              >
                {t("count", { count: total })}
              </p>

              {filters.q && (
                <Link
                  href={clearSearchHref}
                  aria-label={t("clearSearchFor", { q: filters.q })}
                  className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border border-primary/35 bg-primary/10 py-1 pr-2 pl-3 text-xs font-semibold hover:bg-primary/20"
                >
                  <span className="truncate">
                    {t("searchingFor", { q: filters.q })}
                  </span>
                  <X className="size-3.5 shrink-0" aria-hidden="true" />
                </Link>
              )}
            </div>

            <div className="mt-4">
              {jobs.length === 0 ? (
                <EmptyResults
                  filters={filters}
                  activeCount={activeCount}
                  searchAllHref={href(withoutFilters(filters))}
                  clearSearchHref={clearSearchHref}
                  basePath={basePath}
                />
              ) : (
                <ul className="grid gap-3" aria-label={t("results")}>
                  {jobs.map((job) => (
                    <li key={job.id}>
                      <JobCard
                        job={job}
                        tracked={isTracked(job.id)}
                        match={matches.get(job.id)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {pages > 1 && (
              <nav
                aria-label={t("pagination")}
                className="mt-6 flex items-center justify-between gap-3"
              >
                {filters.page > 1 ? (
                  <Button asChild variant="editorialOutline" size="touch">
                    <Link href={pageHref(filters.page - 1)} rel="prev">
                      <ChevronLeft />
                      {t("previous")}
                    </Link>
                  </Button>
                ) : (
                  <span />
                )}
                <p className="text-sm text-muted-foreground">
                  {t("pageOf", { page: filters.page, pages })}
                </p>
                {filters.page < pages ? (
                  <Button asChild variant="editorialOutline" size="touch">
                    <Link href={pageHref(filters.page + 1)} rel="next">
                      {t("next")}
                      <ChevronRight />
                    </Link>
                  </Button>
                ) : (
                  <span />
                )}
              </nav>
            )}
          </section>
        </FeedForm>
      </main>
    </>
  );
}

/**
 * Zero results. When a search and filters together match nothing, offer
 * both ways out: the search without the filters, or the filters without
 * the search.
 */
async function EmptyResults({
  filters,
  activeCount,
  searchAllHref,
  clearSearchHref,
  basePath,
}: {
  filters: FeedFilters;
  activeCount: number;
  searchAllHref: string;
  clearSearchHref: string;
  basePath: FeedPath;
}) {
  const t = await getTranslations("Feed");
  const { q } = filters;

  if (q && activeCount > 0) {
    return (
      <StateBlock
        icon={Search}
        title={t("emptyBothTitle", { q })}
        copy={t("emptyBothBody")}
        action={
          <div className="flex flex-col items-center gap-2 sm:flex-row">
            <Button asChild variant="editorial" size="touch">
              <Link href={searchAllHref}>{t("searchAllFor", { q })}</Link>
            </Button>
            <Button asChild variant="editorialOutline" size="touch">
              <Link href={clearSearchHref}>{t("clearSearch")}</Link>
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <StateBlock
      icon={Search}
      title={q ? t("emptySearchTitle", { q }) : t("emptyTitle")}
      copy={q ? t("emptySearchBody") : t("emptyBody")}
      action={
        <Button asChild variant="editorial" size="touch">
          <Link href={q ? clearSearchHref : basePath}>
            {q ? t("clearSearch") : t("clearFilters")}
          </Link>
        </Button>
      }
    />
  );
}
