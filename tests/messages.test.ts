import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { routing } from "@/i18n/routing";

const messagesDir = join(import.meta.dirname, "..", "messages");

type MessageTree = Record<string, unknown>;

function load(locale: string): MessageTree {
  return JSON.parse(
    readFileSync(join(messagesDir, `${locale}.json`), "utf8"),
  ) as MessageTree;
}

/** Flattens nested messages to "Namespace.key" → value pairs. */
function flatten(tree: MessageTree, prefix = ""): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object") {
      for (const entry of flatten(value as MessageTree, path)) {
        out.set(...entry);
      }
    } else {
      out.set(path, value);
    }
  }
  return out;
}

describe("translation messages", () => {
  const source = flatten(load(routing.defaultLocale));

  it("has a messages file for every configured locale, and no extras", () => {
    const files = readdirSync(messagesDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
    expect(files).toEqual([...routing.locales].sort());
  });

  it("has only non-empty string values", () => {
    for (const [key, value] of source) {
      expect(typeof value, key).toBe("string");
      expect(String(value).trim(), key).not.toBe("");
    }
  });

  it.each(routing.locales)(
    "%s has exactly the same keys as the default",
    (locale) => {
      const keys = [...flatten(load(locale)).keys()].sort();
      expect(keys).toEqual([...source.keys()].sort());
    },
  );
});
