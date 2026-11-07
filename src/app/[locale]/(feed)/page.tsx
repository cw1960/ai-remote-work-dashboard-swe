import { FeedView } from "@/components/jobs/feed-view";

/** The public job feed, with the welcome intro for visitors. */
export default async function FeedPage({
  searchParams,
}: PageProps<"/[locale]">) {
  return <FeedView params={await searchParams} basePath="/" />;
}
