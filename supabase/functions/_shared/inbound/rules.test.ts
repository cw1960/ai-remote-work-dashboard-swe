import { describe, expect, it } from "vitest";

import {
  bareAddress,
  htmlToText,
  domainOf,
  inboundToken,
  platformFor,
  stageFor,
} from "./rules.ts";

const TOKEN = "a".repeat(32);
const PLATFORMS = [
  { slug: "mercor", domains: ["mercor.com"] },
  { slug: "micro1", domains: ["micro1.ai", "micro1.io", "micro1.co"] },
];

describe("inboundToken", () => {
  it("finds the token in a track+ address on the inbound domain", () => {
    expect(
      inboundToken(
        ["someone@example.com", `Me <Track+${TOKEN}@IN.example.com>`],
        "in.example.com",
      ),
    ).toBe(TOKEN);
  });

  it("ignores other domains and malformed tokens", () => {
    expect(inboundToken([`track+${TOKEN}@evil.com`], "in.example.com")).toBe(
      null,
    );
    expect(inboundToken(["track+short@in.example.com"], "in.example.com")).toBe(
      null,
    );
  });
});

describe("addresses", () => {
  it("strips display names and lowercases", () => {
    expect(bareAddress("Mercor <Team@Mercor.com>")).toBe("team@mercor.com");
    expect(domainOf("team@mail.mercor.com")).toBe("mail.mercor.com");
    expect(domainOf("not an address")).toBe(null);
  });
});

describe("platformFor", () => {
  it("uses the sender when it is a platform, subdomains included", () => {
    expect(platformFor("noreply@mail.mercor.com", "", PLATFORMS)).toBe(
      "mercor",
    );
    expect(platformFor("Zara <zara@micro1.io>", "", PLATFORMS)).toBe("micro1");
  });

  it("finds the original sender in a forwarded message", () => {
    const body = [
      "FYI",
      "---------- Forwarded message ---------",
      "From: micro1 <hello@micro1.ai>",
      "Subject: Your interview",
    ].join("\n");
    expect(platformFor("me@gmail.com", body, PLATFORMS)).toBe("micro1");
    expect(
      platformFor("me@gmail.com", "> De : team@mercor.com", PLATFORMS),
    ).toBe("mercor");
  });

  it("does not guess when the sender is unknown or ambiguous", () => {
    expect(
      platformFor("me@gmail.com", "I applied to mercor.com", PLATFORMS),
    ).toBe(null);
    expect(
      platformFor(
        "me@gmail.com",
        "From: a@mercor.com\nFrom: b@micro1.ai",
        PLATFORMS,
      ),
    ).toBe(null);
    expect(platformFor("x@lookalike-mercor.com", "", PLATFORMS)).toBe(null);
  });
});

describe("stageFor", () => {
  it.each([
    ["Thank you for applying to Legal Expert", "", "applied"],
    ["Your application has been received", "", "applied"],
    ["Complete your AI interview", "", "assessment"],
    ["Interview with Zara: next steps", "", "assessment"],
    ["You've received a work offer", "", "offered"],
    ["Your offer letter is ready", "", "offered"],
    [
      "Update on your application",
      "Unfortunately we will not be moving forward.",
      "rejected",
    ],
    ["Schedule your interview with our team", "", "interviewing"],
  ] as const)("%s → %s", (subject, body, stage) => {
    expect(stageFor(subject, body)).toBe(stage);
  });

  it("lets the subject decide when the body mentions several stages", () => {
    expect(
      stageFor(
        "Thank you for applying",
        "Next step: complete your AI interview within 3 days.",
      ),
    ).toBe("applied");
  });

  it("returns null when unsure", () => {
    expect(stageFor("Quick question", "Hi, are you available?")).toBe(null);
    expect(
      stageFor("Update", "Thanks for applying. Please take the assessment."),
    ).toBe(null);
  });

  it("a rejection in the body wins over other mentions", () => {
    expect(
      stageFor(
        "Your application",
        "Thank you for applying. Unfortunately, the position has been filled.",
      ),
    ).toBe("rejected");
  });
});

describe("htmlToText", () => {
  it("keeps line breaks and decodes entities", () => {
    expect(
      htmlToText(
        "<style>p{}</style><p>From: Mercor &lt;team@mercor.com&gt;</p><div>Hi&nbsp;there</div>",
      ),
    ).toBe("From: Mercor <team@mercor.com>\nHi there\n");
  });
});
