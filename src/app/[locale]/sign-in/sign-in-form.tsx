"use client";

import { CircleAlert, Mail, MailCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestMagicLink, type SignInState } from "@/lib/auth/actions";

export function SignInForm({
  next,
  linkFailed,
}: {
  next: string;
  linkFailed: boolean;
}) {
  const t = useTranslations("Auth");
  const [state, action, pending] = useActionState<SignInState, FormData>(
    requestMagicLink,
    { status: "idle" },
  );
  // "Use a different email" dismisses this result; the next send shows again.
  const [dismissed, setDismissed] = useState<SignInState | null>(null);

  if (state.status === "sent" && dismissed !== state) {
    return (
      <div role="status" className="grid gap-3">
        <p className="flex items-center gap-2 text-lg font-bold">
          <MailCheck className="size-5 text-primary" aria-hidden="true" />
          {t("sentTitle")}
        </p>
        <p className="text-sm">{t("sentBody", { email: state.email })}</p>
        <p className="text-sm text-muted-foreground">{t("sentHint")}</p>
        <Button
          type="button"
          variant="editorialOutline"
          size="touch"
          className="justify-self-start"
          onClick={() => {
            setDismissed(state);
          }}
        >
          {t("tryAgain")}
        </Button>
      </div>
    );
  }

  const error =
    state.status === "error"
      ? {
          invalid: t("invalidEmail"),
          rate_limited: t("rateLimited"),
          failed: t("failed"),
        }[state.code]
      : linkFailed
        ? t("linkFailed")
        : null;

  return (
    // Passing the action directly keeps the form working without JavaScript.
    <form action={action} className="grid gap-3" noValidate>
      <input type="hidden" name="next" value={next} />
      <label className="grid gap-1.5 text-sm font-semibold">
        {t("email")}
        <Input
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          required
          placeholder={t("emailPlaceholder")}
          aria-invalid={state.status === "error" && state.code === "invalid"}
          aria-describedby={error ? "sign-in-error" : undefined}
          className="h-12 rounded-xl bg-card text-base"
        />
      </label>
      {error && (
        <p
          id="sign-in-error"
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-destructive/35 bg-destructive/10 p-3 text-sm"
        >
          <CircleAlert
            className="mt-0.5 size-4 shrink-0 text-destructive"
            aria-hidden="true"
          />
          {error}
        </p>
      )}
      <Button type="submit" variant="editorial" size="touch" disabled={pending}>
        <Mail aria-hidden="true" />
        {pending ? t("sending") : t("submit")}
      </Button>
    </form>
  );
}
