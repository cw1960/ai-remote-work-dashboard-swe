"use client";

import { CircleAlert, MailCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { type SubmitEvent, useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { siteConfig } from "@/config/site";
import { subscribeToNewsletter } from "@/lib/newsletter/actions";
import {
  type SignupSource,
  signupSchema,
  utmFromSearch,
} from "@/lib/newsletter/signup";
import { cn } from "@/lib/utils";

type Status = "idle" | "subscribed" | "invalid" | "failed";

/**
 * Signs a visitor up for the newsletter. `source` says where on the site
 * the form is; the page's campaign tags go with it. A signed-in user's
 * email can be filled in, but nothing is sent until they press the button.
 */
export function NewsletterSignup({
  source,
  defaultEmail,
  className,
}: {
  source: SignupSource;
  defaultEmail?: string | undefined;
  className?: string | undefined;
}) {
  const t = useTranslations("Newsletter");
  const id = useId();
  const [status, setStatus] = useState<Status>("idle");
  const [pending, startTransition] = useTransition();

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = {
      email: form.get("email"),
      source,
      utm: utmFromSearch(window.location.search),
      website: form.get("website") ?? "",
    };
    if (!signupSchema.safeParse(input).success) {
      setStatus("invalid");
      return;
    }
    startTransition(async () => {
      const result = await subscribeToNewsletter(input).catch(
        () => ({ ok: false, reason: "failed" }) as const,
      );
      setStatus(result.ok ? "subscribed" : result.reason);
    });
  }

  const titleId = `${id}-title`;
  const errorId = `${id}-error`;

  return (
    <section aria-labelledby={titleId} className={cn("grid gap-2", className)}>
      <h2 id={titleId} className="font-bold">
        {t(`${source}.title`, { newsletter: siteConfig.newsletter.name })}
      </h2>
      <p className="text-sm text-muted-foreground">
        {t(`${source}.body`, { newsletter: siteConfig.newsletter.name })}
      </p>

      {status === "subscribed" ? (
        <p
          role="status"
          className="mt-1 flex items-start gap-2 rounded-xl border border-primary/25 bg-primary/10 p-3 text-sm"
        >
          <MailCheck
            className="mt-0.5 size-4 shrink-0 text-primary"
            aria-hidden="true"
          />
          {t("subscribed")}
        </p>
      ) : (
        <form
          onSubmit={onSubmit}
          noValidate
          aria-labelledby={titleId}
          className="mt-1 grid gap-2"
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor={`${id}-email`} className="sr-only">
              {t("email")}
            </label>
            <Input
              id={`${id}-email`}
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              required
              defaultValue={defaultEmail}
              placeholder={t("emailPlaceholder")}
              aria-invalid={status === "invalid"}
              aria-describedby={
                status === "invalid" || status === "failed"
                  ? errorId
                  : undefined
              }
              className="h-11 rounded-xl bg-card text-base sm:max-w-xs"
            />
            {/* Honeypot: hidden from people and assistive tech; bots fill it. */}
            <div aria-hidden="true" className="absolute -left-[10000px]">
              <label htmlFor={`${id}-website`}>{t("website")}</label>
              <input
                id={`${id}-website`}
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
              />
            </div>
            <Button
              type="submit"
              variant="editorial"
              size="touch"
              disabled={pending}
            >
              {pending ? t("subscribing") : t("submit")}
            </Button>
          </div>
          {(status === "invalid" || status === "failed") && (
            <p
              id={errorId}
              role="alert"
              className="flex items-start gap-2 text-sm text-destructive"
            >
              <CircleAlert
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              {t(status)}
            </p>
          )}
          <p className="text-xs text-muted-foreground">{t("fineprint")}</p>
        </form>
      )}
    </section>
  );
}
