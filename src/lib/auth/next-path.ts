/**
 * Where to go after signing in. Only same-site paths are allowed, so a
 * crafted link can't send people elsewhere ("//evil.com", "/\evil.com",
 * "https://…" all fall back to the home page).
 */
export function safeNextPath(value: string | null | undefined): string {
  if (!value || value.length > 500) return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  if (value.includes("\\")) return "/";
  // Control characters (tabs, newlines) are dropped by browsers, which can
  // turn "/\t/evil.com" into "//evil.com".
  if (/\p{Cc}/u.test(value)) return "/";
  return value;
}
