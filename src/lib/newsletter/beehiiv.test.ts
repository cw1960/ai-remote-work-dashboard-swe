import { describe, expect, it, vi } from "vitest";

import { siteConfig } from "@/config/site";

import { createBeehiivSubscription } from "./beehiiv";

const config = {
  apiKey: "test-key",
  publicationId: "pub_00000000-0000-0000-0000-000000000000",
};

function fakeFetch(status: number) {
  return vi.fn<typeof fetch>(() =>
    Promise.resolve(new Response("{}", { status })),
  );
}

describe("createBeehiivSubscription", () => {
  it("posts the subscriber to the publication with our attribution", async () => {
    const fetchImpl = fakeFetch(201);
    const ok = await createBeehiivSubscription(
      { email: "reader@example.com", source: "job", utm: {} },
      config,
      fetchImpl,
    );

    expect(ok).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe(
      "https://api.beehiiv.com/v2/publications/pub_00000000-0000-0000-0000-000000000000/subscriptions",
    );
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer test-key",
    );
    expect(JSON.parse(init?.body as string)).toEqual({
      email: "reader@example.com",
      reactivate_existing: false,
      send_welcome_email: false,
      utm_source: siteConfig.domain,
      utm_medium: "website",
      utm_campaign: "signup-job",
      referring_site: siteConfig.url,
    });
  });

  it("passes the page's campaign tags on", async () => {
    const fetchImpl = fakeFetch(200);
    await createBeehiivSubscription(
      {
        email: "reader@example.com",
        source: "footer",
        utm: { source: "linkedin", medium: "social", campaign: "launch" },
      },
      config,
      fetchImpl,
    );

    const body = JSON.parse(fetchImpl.mock.calls[0]?.[1]?.body as string) as {
      utm_source: string;
      utm_medium: string;
      utm_campaign: string;
    };
    expect(body).toMatchObject({
      utm_source: "linkedin",
      utm_medium: "social",
      utm_campaign: "launch",
    });
  });

  it("reports a rejected request as a failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const ok = await createBeehiivSubscription(
      { email: "reader@example.com", source: "footer", utm: {} },
      config,
      fakeFetch(400),
    );
    expect(ok).toBe(false);
  });

  it("reports a network error as a failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const ok = await createBeehiivSubscription(
      { email: "reader@example.com", source: "footer", utm: {} },
      config,
      vi.fn<typeof fetch>(() => Promise.reject(new Error("offline"))),
    );
    expect(ok).toBe(false);
  });
});
