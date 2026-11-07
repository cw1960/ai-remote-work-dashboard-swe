import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import type { Domain, FeedFilters } from "@/lib/jobs/filters";
import type { FilterOptions } from "@/lib/jobs/options";

const PAY_PRESETS = [20, 40, 60, 100] as const;

/** A real checkbox or radio styled as a selectable row or pill. */
function Choice({
  type,
  name,
  value,
  checked,
  pill,
  children,
}: {
  type: "checkbox" | "radio";
  name: string;
  value: string;
  checked: boolean;
  pill?: boolean;
  children: ReactNode;
}) {
  return (
    <label
      className={
        pill
          ? "group inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border bg-card/60 px-3 text-sm text-foreground/85 has-checked:border-primary/35 has-checked:bg-primary/10 has-checked:text-foreground has-focus-visible:outline-3 has-focus-visible:outline-ring"
          : "group flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-transparent px-3 text-sm hover:bg-secondary has-checked:border-primary/35 has-checked:bg-primary/10 has-focus-visible:outline-3 has-focus-visible:outline-ring"
      }
    >
      <input
        type={type}
        name={name}
        value={value}
        defaultChecked={checked}
        className="sr-only"
      />
      {!pill && (
        <span className="grid size-5 shrink-0 place-items-center rounded-md border border-input group-has-checked:border-primary group-has-checked:bg-primary group-has-checked:text-primary-foreground">
          <Check
            className="size-3.5 opacity-0 group-has-checked:opacity-100"
            aria-hidden="true"
          />
        </span>
      )}
      {pill && (
        <Check
          className="hidden size-4 group-has-checked:block"
          aria-hidden="true"
        />
      )}
      <span className="flex-1">{children}</span>
    </label>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="border-t border-border py-4 first:border-t-0">
      <legend className="mb-3 text-xs font-bold text-muted-foreground uppercase">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

/** The filter controls; rendered once per open panel inside the feed form. */
export function FilterFields({
  filters,
  options,
}: {
  filters: FeedFilters;
  options: FilterOptions;
}) {
  const t = useTranslations();

  return (
    <div>
      <Group title={t("Feed.platform")}>
        <div className="grid gap-1">
          {options.platforms.map((p) => (
            <Choice
              key={p.slug}
              type="checkbox"
              name="platform"
              value={p.slug}
              checked={filters.platforms.includes(p.slug)}
            >
              <span className="flex justify-between gap-2">
                <span className="font-medium">{p.name}</span>
                <span className="text-muted-foreground">{p.count}</span>
              </span>
            </Choice>
          ))}
        </div>
      </Group>

      <Group title={t("Feed.domain")}>
        <div className="flex flex-wrap gap-2">
          {options.domains.map((d) => (
            <Choice
              key={d.value}
              pill
              type="checkbox"
              name="domain"
              value={d.value}
              checked={filters.domains.includes(d.value as Domain)}
            >
              {t(`Domains.${d.value as Domain}`)}
            </Choice>
          ))}
        </div>
      </Group>

      <Group title={t("Feed.minPay")}>
        <div className="flex flex-wrap gap-2">
          <Choice
            pill
            type="radio"
            name="minPay"
            value=""
            checked={filters.minPay === null}
          >
            {t("Feed.anyPay")}
          </Choice>
          {PAY_PRESETS.map((amount) => (
            <Choice
              key={amount}
              pill
              type="radio"
              name="minPay"
              value={String(amount)}
              checked={filters.minPay === amount}
            >
              ${amount}+
            </Choice>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {t("Feed.minPayHint")}
        </p>
      </Group>

      {options.languages.length > 0 && (
        <Group title={t("Feed.language")}>
          <div className="grid max-h-56 gap-0.5 overflow-y-auto">
            {options.languages.map((l) => (
              <Choice
                key={l.value}
                type="checkbox"
                name="language"
                value={l.value}
                checked={filters.languages.includes(l.value)}
              >
                <span className="flex justify-between gap-2">
                  <span>{l.name}</span>
                  <span className="text-muted-foreground">{l.count}</span>
                </span>
              </Choice>
            ))}
          </div>
        </Group>
      )}

      <Group title={t("Feed.country")}>
        <select
          name="country"
          defaultValue={filters.country ?? ""}
          aria-label={t("Feed.country")}
          className="h-11 w-full rounded-xl border border-input bg-card px-3 text-sm"
        >
          <option value="" className="bg-popover">
            {t("Feed.anyCountry")}
          </option>
          {options.countries.map((c) => (
            <option key={c.code} value={c.code} className="bg-popover">
              {c.name}
            </option>
          ))}
        </select>
      </Group>

      <Group title={t("Feed.posted")}>
        <div className="grid gap-1">
          {(
            [
              ["", t("Feed.postedAny")],
              ["1d", t("Feed.posted1d")],
              ["7d", t("Feed.posted7d")],
              ["30d", t("Feed.posted30d")],
            ] as const
          ).map(([value, label]) => (
            <Choice
              key={value}
              type="radio"
              name="posted"
              value={value}
              checked={(filters.posted ?? "") === value}
            >
              {label}
            </Choice>
          ))}
        </div>
      </Group>
    </div>
  );
}
