import { describe, expect, it } from "vitest";

import { micro1JobPageUrl, parseMicro1JobPage } from "./micro1-page.ts";

/** A page whose server component stream carries the given rows. */
function page(...rows: string[]): string {
  const scripts = rows.map(
    (row) => `<script>self.__next_f.push([1,${JSON.stringify(row)}])</script>`,
  );
  return `<!DOCTYPE html><html><body>${scripts.join("")}</body></html>`;
}

const DESCRIPTION =
  "<p>micro1 is engaging Psychiatrists — bilingual in Japanese.</p><p><br /></p>" +
  "<p>Scope of Work</p><ol>" +
  '<li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>Develop case studies.</li>' +
  '<li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>Write <strong>clear</strong> analyses &amp; notes.</li>' +
  "</ol>";

const EXPECTED =
  "micro1 is engaging Psychiatrists — bilingual in Japanese.\n\n" +
  "Scope of Work\n- Develop case studies.\n- Write clear analyses & notes.";

function job(description: string): string {
  return `1f:["$","div",null,{"job":{"job_id":"abc","job_name":"Psychiatrist","job_description":${JSON.stringify(description)},"job_status":"open"}}]\n`;
}

/** A text row as React writes it: byte length in hex, then the text. */
function textRow(id: string, text: string): string {
  const bytes = new TextEncoder().encode(text).length;
  return `${id}:T${bytes.toString(16)},${text}`;
}

describe("parseMicro1JobPage", () => {
  it("reads a description referenced as a text row", () => {
    expect(
      parseMicro1JobPage(
        page(job("$16"), textRow("16", DESCRIPTION), '17:["$","p",null,{}]\n'),
      ),
    ).toBe(EXPECTED);
  });

  it("reads a text row that arrives before the job", () => {
    expect(
      parseMicro1JobPage(page(textRow("a2", DESCRIPTION), job("$a2"))),
    ).toBe(EXPECTED);
  });

  it("reads an inline description", () => {
    expect(parseMicro1JobPage(page(job(DESCRIPTION)))).toBe(EXPECTED);
  });

  it("returns null without a description", () => {
    expect(parseMicro1JobPage(page('0:["$","html",null,{}]\n'))).toBeNull();
    expect(parseMicro1JobPage(page(job("<p>TBD</p>")))).toBeNull();
    expect(parseMicro1JobPage(page(job("$99")))).toBeNull();
    expect(parseMicro1JobPage("<html>Not found</html>")).toBeNull();
  });

  it("caps very long descriptions", () => {
    const long = `<p>${"Annotate medical cases carefully. ".repeat(1000)}</p>`;
    expect(parseMicro1JobPage(page(job(long)))?.length).toBeLessThanOrEqual(
      20_000,
    );
  });
});

describe("micro1JobPageUrl", () => {
  it("builds the job page address", () => {
    expect(micro1JobPageUrl("f3ca9a77-ffd0-4eb7")).toBe(
      "https://jobs.micro1.ai/post/f3ca9a77-ffd0-4eb7",
    );
  });
});
