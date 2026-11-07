import {
  BriefcaseBusiness,
  FileText,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/listings/queries";

/**
 * Header account area: "Sign in", or the signed-in email, the account
 * links and "Sign out". Admins also get a link to the admin pages.
 */
export async function AccountNav() {
  const [t, user, admin] = await Promise.all([
    getTranslations("Auth"),
    getSessionUser(),
    isAdmin(),
  ]);

  if (!user) {
    return (
      <Button asChild variant="editorial" size="touch">
        <Link href="/sign-in">{t("signIn")}</Link>
      </Button>
    );
  }

  return (
    <>
      <span className="hidden max-w-[16rem] truncate text-sm text-muted-foreground sm:inline">
        {user.email}
      </span>
      <Button
        asChild
        variant="editorialOutline"
        size="touch"
        className="px-3 sm:px-5"
      >
        <Link href="/dashboard">
          <LayoutDashboard aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">{t("dashboard")}</span>
        </Link>
      </Button>
      <Button
        asChild
        variant="editorialOutline"
        size="touch"
        className="px-3 sm:px-5"
      >
        <Link href="/jobs">
          <BriefcaseBusiness aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">{t("allJobs")}</span>
        </Link>
      </Button>
      <Button
        asChild
        variant="editorialOutline"
        size="touch"
        className="px-3 sm:px-5"
      >
        <Link href="/onboarding">
          <UserRound aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">{t("profile")}</span>
        </Link>
      </Button>
      <Button
        asChild
        variant="editorialOutline"
        size="touch"
        className="px-3 sm:px-5"
      >
        <Link href="/resume">
          <FileText aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">{t("resume")}</span>
        </Link>
      </Button>
      {admin && (
        <Button
          asChild
          variant="editorialOutline"
          size="touch"
          className="px-3 sm:px-5"
        >
          <Link href="/admin">
            <ShieldCheck aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">{t("admin")}</span>
          </Link>
        </Button>
      )}
      <form action="/auth/sign-out" method="post">
        <Button
          type="submit"
          variant="editorialOutline"
          size="touch"
          className="px-3 sm:px-5"
        >
          <LogOut aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">{t("signOut")}</span>
        </Button>
      </form>
    </>
  );
}
