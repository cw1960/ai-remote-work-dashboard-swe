import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";

import { AccountNav } from "@/components/account-nav";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import { getUsers, USERS_PAGE_SIZE } from "@/lib/admin/queries";
import { isAdmin } from "@/lib/listings/queries";

import { AdminNav } from "../admin-nav";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Admin.users");
  return { title: t("metaTitle"), robots: { index: false } };
}

const searchSchema = z.object({
  q: z.string().trim().max(200).catch(""),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

// Cells wrap long emails and errors so tables fit a phone without a
// sideways-scrolling region.
const cellClass =
  "border-b border-border px-3 py-2 text-left align-top wrap-anywhere";

function pageHref(q: string, page: number): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/users?${query}` : "/admin/users";
}

/** Admin: accounts, newest first, searchable by email. */
export default async function AdminUsersPage({
  searchParams,
}: PageProps<"/[locale]/admin/users">) {
  if (!(await isAdmin())) notFound();
  const raw = await searchParams;
  const { q, page } = searchSchema.parse({
    q: typeof raw.q === "string" ? raw.q : "",
    page: typeof raw.page === "string" ? raw.page : "1",
  });
  const [t, locale, { users, total }] = await Promise.all([
    getTranslations("Admin.users"),
    getLocale(),
    getUsers(q, page),
  ]);
  const pages = Math.max(1, Math.ceil(total / USERS_PAGE_SIZE));
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  });

  return (
    <>
      <SiteHeader>
        <AccountNav />
      </SiteHeader>
      <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-12">
        <h1 className="mb-6 font-display text-3xl font-extrabold">
          {t("title")}
        </h1>
        <AdminNav current="users" />

        <form
          role="search"
          action="/admin/users"
          className="flex flex-wrap items-end gap-3"
        >
          <div className="grid min-w-60 flex-1 gap-1.5">
            <label
              htmlFor="admin-user-search"
              className="text-sm font-semibold"
            >
              {t("searchLabel")}
            </label>
            <Input
              id="admin-user-search"
              name="q"
              type="search"
              defaultValue={q}
              autoComplete="off"
            />
          </div>
          <Button type="submit" variant="editorial" size="touch">
            {t("search")}
          </Button>
          {q && (
            <Button asChild variant="editorialLink" size="touch">
              <Link href="/admin/users">{t("clear")}</Link>
            </Button>
          )}
        </form>

        <p role="status" className="mt-6 text-sm text-muted-foreground">
          {t("count", { count: total })}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{t("privacy")}</p>

        {users.length === 0 ? (
          <p className="mt-6 text-sm">{t("empty")}</p>
        ) : (
          <div className="mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th scope="col" className={cellClass}>
                    {t("email")}
                  </th>
                  <th scope="col" className={cellClass}>
                    {t("joined")}
                  </th>
                  <th scope="col" className={cellClass}>
                    {t("lastSignIn")}
                  </th>
                  <th scope="col" className={cellClass}>
                    {t("profile")}
                  </th>
                  <th scope="col" className={cellClass}>
                    {t("cards")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.user_id}>
                    <th scope="row" className={`${cellClass} font-semibold`}>
                      {user.email}
                    </th>
                    <td className={cellClass}>
                      {date.format(new Date(user.created_at))}
                    </td>
                    <td className={cellClass}>
                      {user.last_sign_in_at
                        ? date.format(new Date(user.last_sign_in_at))
                        : t("never")}
                    </td>
                    <td className={cellClass}>
                      {user.onboarded ? t("done") : t("notDone")}
                    </td>
                    <td className={cellClass}>{user.cards}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <nav
            aria-label={t("page", { page, pages })}
            className="mt-6 flex flex-wrap items-center gap-3"
          >
            {page > 1 && (
              <Button asChild variant="editorialOutline" size="touch">
                <Link href={pageHref(q, page - 1)}>{t("previous")}</Link>
              </Button>
            )}
            <span className="text-sm text-muted-foreground">
              {t("page", { page, pages })}
            </span>
            {page < pages && (
              <Button asChild variant="editorialOutline" size="touch">
                <Link href={pageHref(q, page + 1)}>{t("next")}</Link>
              </Button>
            )}
          </nav>
        )}
      </main>
    </>
  );
}
