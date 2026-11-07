import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Empty and error states: icon, title, optional copy and action. */
export function StateBlock({
  icon: Icon,
  title,
  copy,
  action,
  tone,
  headingLevel,
}: {
  icon: LucideIcon;
  title: string;
  copy?: string;
  action?: ReactNode;
  tone?: "error";
  /** Render the title as the page's h1 (whole-page states like 404). */
  headingLevel?: 1;
}) {
  const Title = headingLevel === 1 ? "h1" : "p";
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className="flex flex-col items-center rounded-2xl border border-border px-6 py-14 text-center glass-panel"
    >
      <span
        className={cn(
          "grid size-12 place-items-center rounded-full",
          tone === "error"
            ? "bg-destructive/10 text-destructive"
            : "bg-secondary text-muted-foreground",
        )}
      >
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <Title className="mt-4 text-base font-bold">{title}</Title>
      {copy && <p className="mt-1 text-sm text-muted-foreground">{copy}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
