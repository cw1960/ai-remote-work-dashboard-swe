#!/usr/bin/env node
// Prints the site's public base URL from src/config/site.ts, for the deploy
// workflow (set_app_url: where pg_cron sends the daily reminders call).
const { siteConfig } = await import("../src/config/site.ts");
process.stdout.write(new URL(siteConfig.url).origin);
