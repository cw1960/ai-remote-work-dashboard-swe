import { SiteHeader } from "@/components/site-header";
import { Skeleton } from "@/components/ui/skeleton";

/** Dashboard skeleton (skeletons, never spinners). */
export default function Loading() {
  return (
    <>
      <SiteHeader />
      <main
        id="main"
        aria-busy="true"
        className="mx-auto w-full max-w-[1600px] flex-1 px-4 pt-7 pb-16 sm:px-6 lg:px-8"
      >
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-3 h-9 w-72" />
        <Skeleton className="mt-3 h-5 w-96 max-w-full" />
        <Skeleton className="mt-8 h-40 rounded-2xl" />
        <Skeleton className="mt-10 h-7 w-48" />
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Skeleton className="h-36 rounded-2xl" />
          <Skeleton className="h-36 rounded-2xl" />
        </div>
        <Skeleton className="mt-12 h-7 w-40" />
        <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton
              key={i}
              className="h-56 rounded-2xl not-first:hidden lg:not-first:block"
            />
          ))}
        </div>
        <Skeleton className="mt-12 h-7 w-32" />
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-6">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton
              key={i}
              className="h-72 rounded-2xl not-first:hidden lg:not-first:block"
            />
          ))}
        </div>
      </main>
    </>
  );
}
