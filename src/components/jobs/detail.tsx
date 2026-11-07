import { ChevronRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/** Building blocks shared by the job and platform pages. */

export function Breadcrumbs({
  label,
  items,
}: {
  label: string;
  /** Every item but the last is a link when it has an href. */
  items: { label: string; href?: string }[];
}) {
  return (
    <nav aria-label={label} className="mb-4">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={item.label} className="flex min-w-0 items-center gap-1">
              {last ? (
                <span
                  aria-current="page"
                  className="truncate px-1 font-medium text-foreground"
                >
                  {item.label}
                </span>
              ) : item.href ? (
                <Link
                  href={item.href}
                  className="inline-flex min-h-11 items-center rounded px-1 hover:text-foreground"
                >
                  {item.label}
                </Link>
              ) : (
                <span className="px-1">{item.label}</span>
              )}
              {!last && (
                <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** One labelled fact in a <dl>. */
export function Fact({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card/60 p-3">
      <dt className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Icon className="size-3.5" aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-1 text-sm font-bold break-words">{children}</dd>
    </div>
  );
}

/** The platform's initial as a gradient tile, until real logos exist. */
export function PlatformMark({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-lg font-bold text-primary-foreground gradient-primary",
        className,
      )}
      aria-hidden="true"
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
