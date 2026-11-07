import type { ReactNode } from "react";

import { siteConfig } from "@/config/site";
import { Link } from "@/i18n/navigation";

/**
 * The top bar. `children` goes on the right: pages pass <AccountNav />;
 * error and loading states (client or static) leave it empty.
 */
export function SiteHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex min-w-0 items-center gap-3 rounded-lg">
          <span
            className="grid size-9 shrink-0 place-items-center rounded-lg font-extrabold text-primary-foreground gradient-primary"
            aria-hidden="true"
          >
            {siteConfig.name.charAt(0)}
          </span>
          <span className="truncate font-extrabold">{siteConfig.name}</span>
        </Link>
        {children && (
          <div className="flex shrink-0 items-center gap-2">{children}</div>
        )}
      </div>
    </header>
  );
}
