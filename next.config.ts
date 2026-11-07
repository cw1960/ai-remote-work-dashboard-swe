import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The Playbook PDF is read from disk by its download route only.
  outputFileTracingIncludes: {
    "/api/playbook/download": ["./content/playbook/**"],
  },
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // Resume uploads: files up to 4 MB, plus the form's overhead.
      bodySizeLimit: "5mb",
    },
  },
  headers() {
    return Promise.resolve([{ source: "/:path*", headers: securityHeaders }]);
  },
};

export default withNextIntl(nextConfig);
