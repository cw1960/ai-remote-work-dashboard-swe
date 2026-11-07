/** Why a job fits the signed-in user (see match_jobs in SQL). */
export interface MatchReasons {
  /** The user's field the job is in. */
  domain: string | null;
  /** Languages the user and the job share. */
  languages: string[];
  /** Hourly pay reaches the user's target rate. */
  payOk: boolean;
  /** The job is limited to countries, including the user's. */
  country: string | null;
}

/** Whether there is anything to say about a match. */
export function hasReasons(reasons: MatchReasons): boolean {
  return (
    reasons.domain !== null ||
    reasons.languages.length > 0 ||
    reasons.payOk ||
    reasons.country !== null
  );
}
