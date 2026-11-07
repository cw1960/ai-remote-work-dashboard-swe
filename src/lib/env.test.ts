import { describe, expect, it, vi } from "vitest";

import { siteConfig } from "@/config/site";

import { getPublicEnv, getServerEnv, getSiteUrl } from "./env";

describe("getPublicEnv", () => {
  it("returns validated public variables", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");

    expect(getPublicEnv()).toMatchObject({
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    });
  });

  it("rejects a missing anon key", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    expect(() => getPublicEnv()).toThrow();
  });

  it("rejects a malformed Supabase URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "not a url");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");

    expect(() => getPublicEnv()).toThrow();
  });
});

describe("getSiteUrl", () => {
  it("uses NEXT_PUBLIC_SITE_URL when set", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://preview.example.com");
    expect(getSiteUrl().origin).toBe("https://preview.example.com");
  });

  it("falls back to Netlify's site URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("URL", "https://example.netlify.app");
    expect(getSiteUrl().origin).toBe("https://example.netlify.app");
  });

  it("falls back to the configured site URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("URL", "");
    expect(getSiteUrl().href).toBe(new URL(siteConfig.url).href);
  });

  it("rejects a malformed URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "nope");
    expect(() => getSiteUrl()).toThrow();
  });
});

describe("getServerEnv", () => {
  it("keeps the forwarding address hidden unless turned on", () => {
    vi.stubEnv("INBOUND_EMAIL_ENABLED", "");
    expect(getServerEnv().INBOUND_EMAIL_ENABLED).toBe(false);
    vi.stubEnv("INBOUND_EMAIL_ENABLED", "true");
    expect(getServerEnv().INBOUND_EMAIL_ENABLED).toBe(true);
  });

  it("treats empty Beehiiv settings as unset", () => {
    vi.stubEnv("BEEHIIV_API_KEY", "");
    vi.stubEnv("BEEHIIV_PUBLICATION_ID", "");
    expect(getServerEnv()).toMatchObject({
      BEEHIIV_API_KEY: undefined,
      BEEHIIV_PUBLICATION_ID: undefined,
    });
  });

  it("rejects a malformed Beehiiv publication id", () => {
    vi.stubEnv("BEEHIIV_PUBLICATION_ID", "AI Remote Work Today");
    expect(() => getServerEnv()).toThrow();
  });
});
