import { playbookConfig } from "@/config/playbook";

/** The Playbook's price for display, e.g. "$19" (cents only when needed). */
export function formatPlaybookPrice(locale: string): string {
  const amount = playbookConfig.priceCents / 100;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: playbookConfig.currency.toUpperCase(),
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}
