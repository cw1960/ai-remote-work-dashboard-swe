import { describe, expect, it } from "vitest";

import { normalize, unsupportedFacts } from "./facts.ts";
import { MASTER_RESUME, TAILORED_RESUME } from "./fixtures.ts";
import type { Resume } from "./schema.ts";

function withChanges(change: (resume: Resume) => void): Resume {
  const copy = structuredClone(TAILORED_RESUME);
  change(copy);
  return copy;
}

describe("normalize", () => {
  it("ignores case, accents and punctuation", () => {
    expect(normalize("Universidad Autónoma, de NUEVO-León")).toBe(
      "universidad autonoma de nuevo leon",
    );
  });
});

describe("unsupportedFacts", () => {
  it("accepts a resume that only uses facts from the master resume", () => {
    expect(unsupportedFacts(TAILORED_RESUME, MASTER_RESUME)).toEqual([]);
  });

  it("flags an invented employer and job title", () => {
    const resume = withChanges((r) => {
      r.experience.push({
        title: "AI Trainer",
        employer: "Outlier",
        location: null,
        dates: null,
        bullets: [],
      });
    });
    expect(unsupportedFacts(resume, MASTER_RESUME)).toEqual([
      "Outlier",
      "AI Trainer",
    ]);
  });

  it("flags changed dates and invented metrics", () => {
    const resume = withChanges((r) => {
      const job = r.experience[0];
      if (!job) throw new Error("fixture");
      job.dates = "Aug 2015 – Present";
      job.bullets.push("Raised pass rates by 40% for 300 students.");
    });
    expect(unsupportedFacts(resume, MASTER_RESUME)).toEqual([
      "2015",
      "40",
      "300",
    ]);
  });

  it("flags an invented degree, certification and skill", () => {
    const resume = withChanges((r) => {
      r.education.push({
        credential: "M.Sc. in Computer Science",
        institution: "MIT",
        dates: null,
        details: [],
      });
      r.certifications.push("AWS Certified Machine Learning");
      r.skills.push("Python");
    });
    expect(unsupportedFacts(resume, MASTER_RESUME)).toEqual([
      "MIT",
      "M.Sc. in Computer Science",
      "AWS Certified Machine Learning",
      "Python",
    ]);
  });

  it("allows a reworded skill when its key word is in the master resume", () => {
    const resume = withChanges((r) => {
      r.skills.push("Grading of written work");
    });
    expect(unsupportedFacts(resume, MASTER_RESUME)).toEqual([]);
  });

  it("matches phrases on whole words only", () => {
    const resume = withChanges((r) => {
      r.certifications = ["DELE"];
      r.skills.push("Docs");
    });
    // "DELE" is a whole word in the master resume, so it's supported.
    expect(unsupportedFacts(resume, "DELEGATE docs")).toContain("DELE");
    expect(unsupportedFacts(resume, MASTER_RESUME)).not.toContain("DELE");
  });
});
