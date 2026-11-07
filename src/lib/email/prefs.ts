/** The email types a person can turn on or off. */
export const EMAIL_PREFS = ["alerts_on", "reminders_on", "recap_on"] as const;
export type EmailPref = (typeof EMAIL_PREFS)[number];
export type EmailPrefs = Record<EmailPref, boolean>;

/** Which emails an unsubscribe link turns off ("all" for every type). */
export const EMAIL_LISTS = ["alerts", "reminders", "recap", "all"] as const;
export type EmailList = (typeof EMAIL_LISTS)[number];

/** set_email_prefs_by_token arguments that turn a list off. */
export function unsubscribeArgs(list: EmailList): {
  p_alerts_on?: boolean;
  p_reminders_on?: boolean;
  p_recap_on?: boolean;
} {
  if (list === "all") {
    return { p_alerts_on: false, p_reminders_on: false, p_recap_on: false };
  }
  return { [`p_${list}_on`]: false };
}
