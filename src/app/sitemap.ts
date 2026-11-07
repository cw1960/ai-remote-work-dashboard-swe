import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/env";
import { LEGAL_DOCS } from "@/lib/legal";
import { createSupabaseAnonClient } from "@/lib/supabase/anon";

/** Rebuilt at most hourly; jobs change every 6 h. */
export const revalidate = 3600;

/**
 * /sitemap.xml: the public pages (feed, how it works, legal), every listed
 * platform's page and every open job. Signed-in pages are left out.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = getSiteUrl();
  const url = (path: string) => new URL(path, site).toString();
  const supabase = createSupabaseAnonClient();

  const [platforms, jobs] = await Promise.all([
    supabase.from("platforms").select("slug, updated_at").eq("listed", true),
    supabase
      .from("jobs")
      .select("id, last_seen_at")
      .eq("status", "open")
      .order("last_seen_at", { ascending: false })
      .limit(45_000),
  ]);
  // A database hiccup must not fail a build: list the fixed pages anyway.
  if (platforms.error) console.error("sitemap: platforms", platforms.error);
  if (jobs.error) console.error("sitemap: jobs", jobs.error);

  return [
    { url: url("/"), changeFrequency: "hourly", priority: 1 },
    { url: url("/how-it-works"), changeFrequency: "monthly", priority: 0.5 },
    ...LEGAL_DOCS.map((doc) => ({
      url: url(`/legal/${doc}`),
      changeFrequency: "yearly" as const,
      priority: 0.2,
    })),
    ...(platforms.data ?? []).map((platform) => ({
      url: url(`/platforms/${platform.slug}`),
      lastModified: platform.updated_at,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...(jobs.data ?? []).map((job) => ({
      url: url(`/jobs/${job.id}`),
      lastModified: job.last_seen_at,
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
  ];
}
