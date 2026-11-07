import { type APIRequestContext, expect, type Page } from "@playwright/test";

// Magic-link sign-in against the local Supabase stack. Its emails land in
// Mailpit, whose API the tests read the link from.
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

export function uniqueEmail(project: string): string {
  return `e2e-${project}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

/** The sign-in link from the newest email to `to`, waiting for it. */
export async function magicLink(
  request: APIRequestContext,
  to: string,
): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const search = await request.get(`${MAILPIT}/api/v1/search`, {
          params: { query: `to:"${to}"` },
        });
        const { messages } = (await search.json()) as {
          messages: { ID: string }[];
        };
        const id = messages[0]?.ID;
        if (!id) return undefined;
        const message = await request.get(`${MAILPIT}/api/v1/message/${id}`);
        const { HTML } = (await message.json()) as { HTML: string };
        link = /href="([^"]+)"/.exec(HTML)?.[1]?.replaceAll("&amp;", "&");
        return link;
      },
      { timeout: 15_000 },
    )
    .toBeTruthy();
  return link ?? "";
}

/** Requests a magic link from /sign-in and follows it. */
export async function signIn(
  page: Page,
  request: APIRequestContext,
  email: string,
  next = "/",
): Promise<void> {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Email me a link" }).click();
  await expect(page.getByRole("status")).toContainText("Check your email");
  await page.goto(await magicLink(request, email));
}

/** The signed-in user's access token, read from the auth cookie. */
export async function accessToken(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  const raw = cookies
    .filter((c) => /^sb-.+-auth-token(\.\d+)?$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }))
    .map((c) => c.value)
    .join("");
  const json = raw.startsWith("base64-")
    ? Buffer.from(raw.slice(7), "base64url").toString("utf8")
    : decodeURIComponent(raw);
  const { access_token } = JSON.parse(json) as { access_token: string };
  return access_token;
}

/** Calls a database function through the REST API as the signed-in user. */
export async function rpcAsUser(
  page: Page,
  request: APIRequestContext,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
  const response = await request.post(`${url}/rest/v1/rpc/${name}`, {
    headers: {
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      Authorization: `Bearer ${await accessToken(page)}`,
    },
    data: args,
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

/**
 * Reads a column of the signed-in user's own email_prefs row through the
 * Supabase REST API, as that user (session from the auth cookie).
 */
export async function ownEmailPrefs(
  page: Page,
  request: APIRequestContext,
): Promise<{
  unsubscribe_token: string;
  reminders_on: boolean;
  inbound_token: string;
}> {
  const access_token = await accessToken(page);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
  const response = await request.get(
    `${url}/rest/v1/email_prefs?select=unsubscribe_token,reminders_on,inbound_token`,
    {
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
        Authorization: `Bearer ${access_token}`,
      },
    },
  );
  const rows = (await response.json()) as {
    unsubscribe_token: string;
    reminders_on: boolean;
    inbound_token: string;
  }[];
  const row = rows[0];
  if (!row) throw new Error("no email_prefs row");
  return row;
}

/**
 * Records a forwarded email the way the inbound-email function does
 * (record_inbound_email with the service role). Uses the local stack's
 * service role key, which CI passes as E2E_SUPABASE_SERVICE_ROLE_KEY.
 */
export async function recordInboundEmail(
  request: APIRequestContext,
  email: {
    token: string;
    from: string;
    subject: string;
    platform: string | null;
    stage: string | null;
  },
): Promise<string> {
  const key = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
  const response = await request.post(
    `${url}/rest/v1/rpc/record_inbound_email`,
    {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      data: {
        p_token: email.token,
        p_from: email.from,
        p_subject: email.subject,
        p_platform: email.platform,
        p_stage: email.stage,
      },
    },
  );
  expect(response.ok()).toBe(true);
  return (await response.json()) as string;
}
