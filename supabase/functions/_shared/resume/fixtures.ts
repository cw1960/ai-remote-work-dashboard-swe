/** Shared test data: a master resume and a faithful tailored version of it. */
import type { Resume, TailorOutput } from "./schema.ts";

export const MASTER_RESUME = `Ana López
ana.lopez@example.com · +52 81 5555 0100 · Monterrey, Mexico

Summary
Bilingual teacher with seven years of classroom experience.

Experience
Spanish Teacher, Colegio Sol, Monterrey — Aug 2019 – Present
- Taught Spanish to 120 students a year across four grades.
- Designed a reading programme that raised test scores by 18%.
- Graded written assignments against detailed rubrics.

Translator (freelance), Self-employed — 2016 – 2019
- Translated legal and medical documents from English to Spanish.

Education
B.A. in Linguistics, Universidad Autónoma de Nuevo León, 2016

Certifications
DELE C2 examiner certification

Skills
Spanish (native), English (C1), rubric-based grading, curriculum design, Google Docs`;

export const TAILORED_RESUME: Resume = {
  name: "Ana López",
  headline: "Bilingual Spanish teacher and translator",
  contact: ["ana.lopez@example.com", "+52 81 5555 0100", "Monterrey, Mexico"],
  summary:
    "Bilingual teacher and translator who grades written work against detailed rubrics.",
  skills: [
    "Rubric-based grading",
    "Spanish (native)",
    "English (C1)",
    "Curriculum design",
  ],
  experience: [
    {
      title: "Spanish Teacher",
      employer: "Colegio Sol",
      location: "Monterrey",
      dates: "Aug 2019 – Present",
      bullets: [
        "Graded written assignments against detailed rubrics.",
        "Designed a reading programme that raised test scores by 18%.",
      ],
    },
    {
      title: "Translator (freelance)",
      employer: "Self-employed",
      location: null,
      dates: "2016 – 2019",
      bullets: [
        "Translated legal and medical documents from English to Spanish.",
      ],
    },
  ],
  education: [
    {
      credential: "B.A. in Linguistics",
      institution: "Universidad Autónoma de Nuevo León",
      dates: "2016",
      details: [],
    },
  ],
  certifications: ["DELE C2 examiner certification"],
  other_sections: [],
};

export const TAILOR_OUTPUT: TailorOutput = {
  resume: TAILORED_RESUME,
  review: {
    changes: ["Moved rubric-based grading to the top of the skills list."],
    emphasized: ["Rubric-based grading", "Native Spanish"],
    gaps: ["Experience training AI models"],
    flags: [],
  },
};
