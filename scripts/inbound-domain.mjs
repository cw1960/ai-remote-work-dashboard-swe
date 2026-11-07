#!/usr/bin/env node
// Prints the email auto-capture domain from src/config/site.ts, so the
// inbound-email function's INBOUND_DOMAIN matches the app's addresses.
const { siteConfig } = await import("../src/config/site.ts");
process.stdout.write(siteConfig.inboundDomain);
