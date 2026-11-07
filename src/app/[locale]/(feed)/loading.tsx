import { JobCardSkeleton } from "@/components/jobs/job-card";
import { SiteHeader } from "@/components/site-header";
import { Skeleton } from "@/components/ui/skeleton";

/** Feed skeleton while results load (skeletons, never spinners). */
export default function Loading() {
  return (
    <>
      <SiteHeader />
      <main
        id="main"
        aria-busy="true"
        className="mx-auto w-full max-w-[1400px] px-4 pt-6 pb-16 sm:px-6 lg:px-8"
      >
        <Skeleton className="h-8 w-72" />
        <Skeleton className="mt-5 h-12 w-full rounded-xl" />
        <div className="mt-6 grid gap-6 md:grid-cols-[280px_minmax(0,1fr)] lg:grid-cols-[300px_minmax(0,1fr)]">
          <Skeleton className="hidden h-96 rounded-2xl md:block" />
          <div className="grid gap-3">
            <Skeleton className="h-5 w-32" />
            {[0, 1, 2, 3].map((i) => (
              <JobCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
