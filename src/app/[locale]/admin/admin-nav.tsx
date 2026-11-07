import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { key: "overview", href: "/admin" },
  { key: "users", href: "/admin/users" },
  { key: "listings", href: "/admin/listings" },
  { key: "newsletter", href: "/admin/newsletter" },
] as const;

type Section = (typeof SECTIONS)[number]["key"];

/** Tabs between the admin pages. */
export async function AdminNav({ current }: { current: Section }) {
  const t = await getTranslations("Admin.nav");
  return (
    <nav aria-label={t("label")} className="mb-8">
      <ul className="flex flex-wrap gap-2">
        {SECTIONS.map((section) => (
          <li key={section.key}>
            <Link
              href={section.href}
              aria-current={section.key === current ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-semibold",
                section.key === current
                  ? "border-primary/35 bg-primary/10 text-foreground"
                  : "border-border bg-card/60 text-foreground/85 hover:border-foreground/25",
              )}
            >
              {t(section.key)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
