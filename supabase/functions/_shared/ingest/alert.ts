/**
 * The "ingestion failed" email, sent through the Resend REST API.
 *
 * Until the sending domain is verified, mail goes from Resend's shared
 * onboarding address, which can only deliver to the Resend account owner.
 * That is exactly who ALERT_EMAIL is.
 */
export const RESEND_EMAILS_URL = "https://api.resend.com/emails";
export const DEFAULT_ALERT_FROM = "Ingestion alerts <onboarding@resend.dev>";

export interface RunReport {
  platform: string;
  requests: number;
  run_id: number;
  found: number;
  skipped: number;
  error: string | null;
}

export function buildAlertEmail(report: RunReport): {
  subject: string;
  text: string;
} {
  return {
    subject: `Ingestion failed: ${report.platform}`,
    text: [
      `The ${report.platform} ingestion run #${report.run_id} failed.`,
      "",
      `Error: ${report.error ?? "unknown"}`,
      `Requests made: ${report.requests}`,
      `Listings found: ${report.found} (skipped: ${report.skipped})`,
      "",
      "No jobs were closed. The next run is in 6 hours; after 3 failures in a",
      "row the platform is retried once a day until it succeeds.",
      "",
      "Check the ingest_runs table in Supabase for the history.",
    ].join("\n"),
  };
}

export async function sendAlert(
  fetchFn: typeof fetch,
  config: { apiKey: string; to: string; from: string },
  report: RunReport,
): Promise<void> {
  const email = buildAlertEmail(report);
  const response = await fetchFn(RESEND_EMAILS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      from: config.from,
      to: [config.to],
      subject: email.subject,
      text: email.text,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Resend answered HTTP ${response.status}`);
  }
}
