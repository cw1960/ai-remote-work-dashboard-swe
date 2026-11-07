#!/usr/bin/env node
// Builds the ingestion User-Agent from src/config/site.ts: the app name, its
// URL and a contact email, as scraping etiquette asks (CLAUDE.md).
const { siteConfig: s } = await import("../src/config/site.ts");
process.stdout.write(
  `${s.name.replace(/\s+/g, "")}-bot/1.0 (+${s.url}; ${s.supportEmail})`,
);
