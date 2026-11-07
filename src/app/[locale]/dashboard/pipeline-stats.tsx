import { getLocale, getTranslations } from "next-intl/server";

import { formatPayAmount } from "@/lib/jobs/format";
import type { PipelineStats as Stats } from "@/lib/tracker/stats";

/** The Pipeline's stats line: four small tiles. */
export async function PipelineStats({ stats }: { stats: Stats }) {
  const [t, tStages, tJob, locale] = await Promise.all([
    getTranslations("Dashboard.stats"),
    getTranslations("Dashboard.stages"),
    getTranslations("Job"),
    getLocale(),
  ]);
  const { responded, applied } = stats.responses;
  const pay = formatPayAmount(stats.hourlyInPlay.total, null, locale);

  const tiles = [
    {
      label: t("appliedThisWeek"),
      value: String(stats.appliedThisWeek),
      note: null,
    },
    {
      label: t("responseRate"),
      value:
        applied > 0
          ? t("responseRateValue", {
              rate: Math.round((responded / applied) * 100),
            })
          : t("noData"),
      note:
        applied > 0
          ? t("responseRateNote", { responded, applied })
          : t("noApplications"),
    },
    {
      label: t("daysPerStage"),
      value: null,
      note: null,
      lines:
        stats.daysPerStage.length > 0
          ? stats.daysPerStage.map(({ stage, days }) =>
              t("days", { stage: tStages(stage), days }),
            )
          : [t("noMoves")],
    },
    {
      label: t("hourlyInPlay"),
      value: pay ? tJob("pay", { amount: pay, unit: "hour" }) : t("noData"),
      note: t("hourlyNote", { jobs: stats.hourlyInPlay.jobs }),
    },
  ];

  return (
    <dl
      aria-label={t("label")}
      className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4"
    >
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="rounded-2xl border border-border p-4 glass-panel"
        >
          <dt className="text-xs font-bold text-muted-foreground uppercase">
            {tile.label}
          </dt>
          {tile.value !== null && (
            <dd className="mt-1 text-2xl font-extrabold">{tile.value}</dd>
          )}
          {tile.note && (
            <dd className="mt-0.5 text-xs text-muted-foreground">
              {tile.note}
            </dd>
          )}
          {"lines" in tile &&
            tile.lines.map((line) => (
              <dd key={line} className="mt-1 text-sm font-semibold">
                {line}
              </dd>
            ))}
        </div>
      ))}
    </dl>
  );
}
