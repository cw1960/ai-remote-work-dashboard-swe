import { getTranslations } from "next-intl/server";

import { NewsletterSignup } from "@/components/newsletter-signup";
import { siteConfig } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { playbookUrl } from "@/lib/playbook/promo";

const LINKS = [
  ["howItWorks", "/how-it-works"],
  ["terms", "/legal/terms"],
  ["privacy", "/legal/privacy"],
  ["cookies", "/legal/cookies"],
  ["affiliates", "/legal/affiliates"],
] as const;

/**
 * Footer on every page: the newsletter signup, how it works, the legal
 * pages and contact.
 */
export async function SiteFooter() {
  const t = await getTranslations("Footer");
  return (
    <footer className="mt-auto border-t border-border">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-3 px-4 py-6 text-sm sm:px-6 lg:px-8">
        <NewsletterSignup source="footer" className="mb-3 max-w-xl" />
        <nav aria-label={t("label")}>
          <ul className="flex flex-wrap gap-x-5 gap-y-1">
            {LINKS.map(([key, href]) => (
              <li key={key}>
                <Link
                  href={href}
                  className="inline-flex min-h-11 items-center rounded text-muted-foreground hover:text-foreground hover:underline"
                >
                  {t(key)}
                </Link>
              </li>
            ))}
            <li>
              <a
                href={playbookUrl("footer")}
                className="inline-flex min-h-11 items-center rounded text-muted-foreground hover:text-foreground hover:underline"
              >
                {t("playbook")}
              </a>
            </li>
            <li>
              <a
                href={`mailto:${siteConfig.supportEmail}`}
                className="inline-flex min-h-11 items-center rounded text-muted-foreground hover:text-foreground hover:underline"
              >
                {t("contact")}
              </a>
            </li>
          </ul>
        </nav>
        <p className="text-xs text-muted-foreground">
          {t("copyright", {
            year: new Date().getUTCFullYear(),
            operator: siteConfig.operator.name,
          })}
        </p>
      </div>
    </footer>
  );
}
