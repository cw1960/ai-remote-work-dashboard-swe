import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { Document, Packer, Paragraph } from "docx";
import { PDFDocument } from "pdf-lib";

import {
  MASTER_RESUME,
  TAILOR_OUTPUT,
} from "../supabase/functions/_shared/resume/fixtures";

import { rpcAsUser, signIn, uniqueEmail } from "./helpers";

// Resume tailoring. The model call itself runs in the tailor-resume Edge
// Function, which is unit-tested with mocked responses and not started in
// CI: here a generated draft is created the way that function records it
// (start_resume_generation, then finish_resume_generation, as the user).
// The job-description function isn't started either; its answers are
// stubbed in the browser.

// Seeded job ids are md5(external_id)::uuid (supabase/seed.sql).
const MICRO1_JOB = "fa1e4a0c-cd30-7714-e00f-2b5d9e129da3"; // French Translator
const DOCX_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const A11Y_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function docxFile(text: string, name = "ana.docx") {
  const document = new Document({
    sections: [
      { children: text.split("\n").map((line) => new Paragraph(line)) },
    ],
  });
  return { name, mimeType: DOCX_TYPE, buffer: await Packer.toBuffer(document) };
}

async function skipOnboarding(page: Page) {
  for (let step = 0; step < 5; step += 1) {
    await page.getByRole("button", { name: "Skip" }).click();
  }
}

async function signedInUser(
  page: Page,
  request: Parameters<typeof signIn>[1],
  project: string,
) {
  await signIn(page, request, uniqueEmail(project));
  await skipOnboarding(page);
}

/** Stubs the job-description function's answer for this page. */
async function stubDescription(page: Page, description: string | null) {
  await page.route("**/functions/v1/job-description", (route) =>
    route.fulfill({
      json: description ? { description, source: "page" } : { description },
    }),
  );
}

async function uploadMaster(
  page: Page,
  text = MASTER_RESUME,
  name = "ana.docx",
) {
  await page
    .locator('input[type="file"]')
    .setInputFiles(await docxFile(text, name));
}

/** A draft for the job, recorded the way the tailor-resume function does. */
async function createDraft(
  page: Page,
  request: Parameters<typeof signIn>[1],
  jobId: string,
  summary = TAILOR_OUTPUT.resume.summary,
): Promise<string> {
  const [started] = (await rpcAsUser(page, request, "start_resume_generation", {
    p_job_id: jobId,
  })) as { generation_id: number }[];
  if (!started) throw new Error("generation not started");
  return (await rpcAsUser(page, request, "finish_resume_generation", {
    p_generation_id: started.generation_id,
    p_ok: true,
    p_error: null,
    p_model: "claude-opus-5-5",
    p_input_tokens: 4000,
    p_output_tokens: 1500,
    p_content: { ...TAILOR_OUTPUT.resume, summary },
    p_review: { ...TAILOR_OUTPUT.review, unverified: [] },
  })) as string;
}

test.describe("resume tailoring", () => {
  test("asks for a resume, takes the upload and comes back to tailor", async ({
    page,
    request,
  }, testInfo) => {
    await signedInUser(page, request, testInfo.project.name);
    await stubDescription(page, null);
    await page.goto(`/jobs/${MICRO1_JOB}`);

    const panel = page.getByRole("region", { name: "Tailored resume" });
    await expect(panel).toContainText("Resume not yet tailored for this job.");
    await panel
      .getByRole("button", { name: "Tailor My Resume for This Job" })
      .click();
    const dialog = page.getByRole("dialog", { name: "Tailor my resume" });
    await expect(dialog).toContainText("For French Translator at micro1.");
    await expect(dialog).toContainText("Set up your Master Profile first");
    await dialog
      .getByRole("link", { name: "Set up my Master Profile" })
      .click();

    await expect(page).toHaveURL(/\/resume\?next=/);
    await expect(
      page.getByText("Set up your Master Profile to tailor resumes"),
    ).toBeVisible();
    await expect(page).toHaveTitle(/\S/);
    const scan = await new AxeBuilder({ page }).withTags(A11Y_TAGS).analyze();
    expect(scan.violations).toEqual([]);

    await uploadMaster(page);

    // Straight back to the same job, with the tailoring dialog open.
    await expect(page).toHaveURL(new RegExp(`/jobs/${MICRO1_JOB}\\?tailor=1$`));
    const form = page.getByRole("dialog", { name: "Tailor my resume" });
    const description = form.getByLabel("Full job description");
    await expect(description).toBeVisible();
    const generate = form.getByRole("button", { name: "Tailor my resume" });
    await expect(generate).toBeDisabled();
    await expect(form).toContainText("more characters needed");
    await expect(form).toContainText(
      "We couldn't get this job's full description automatically",
    );

    await description.fill(
      "Translate and review French technical content for AI training. ".repeat(
        8,
      ),
    );
    await expect(generate).toBeEnabled();
    await expect(form).toContainText("5 tailored resumes left today.");

    // The AI service isn't running in tests: the failure is explained, the
    // pasted description is kept, and no draft is created.
    await generate.click();
    await expect(form.getByRole("alert")).toBeVisible();
    await expect(description).not.toHaveValue("");
    await page.goto("/resume");
    await expect(page.getByText("No tailored resumes yet")).toBeVisible();
  });

  test("fills in the job description when the site has it", async ({
    page,
    request,
  }, testInfo) => {
    const text =
      "Translate and review French technical content for AI training. "
        .repeat(8)
        .trim();
    await signedInUser(page, request, testInfo.project.name);
    await page.goto("/resume");
    await uploadMaster(page);
    await expect(page.getByTestId("master-file-name")).toHaveText("ana.docx");

    await stubDescription(page, text);
    await page.goto(`/jobs/${MICRO1_JOB}`);
    await page
      .getByRole("region", { name: "Tailored resume" })
      .getByRole("button", { name: "Tailor My Resume for This Job" })
      .click();
    const form = page.getByRole("dialog", { name: "Tailor my resume" });
    await expect(form.getByLabel("Full job description")).toHaveValue(text);
    await expect(form).toContainText("We filled in the full description");
    await expect(
      form.getByRole("button", { name: "Tailor my resume" }),
    ).toBeEnabled();
    const scan = await new AxeBuilder({ page }).withTags(A11Y_TAGS).analyze();
    expect(scan.violations).toEqual([]);
  });

  test("keeps a Master Profile with core skills and evidence", async ({
    page,
    request,
  }, testInfo) => {
    const evidence = "- Raised pass rates 18% at Colegio Sol (2023)";
    await signedInUser(page, request, testInfo.project.name);
    await page.goto("/resume");
    await expect(
      page.getByRole("heading", { level: 1, name: "Master Profile" }),
    ).toBeVisible();

    const resume = page.getByLabel("Baseline Master Resume");
    const skills = page.getByLabel("Core Skills & Evidence");
    const save = page.getByRole("button", { name: "Save Master Profile" });

    // Too short to tailor from: explained, nothing saved.
    await resume.fill("Ana López, teacher.");
    await save.click();
    await expect(
      page.getByRole("alert").filter({ hasText: "at least 200 characters" }),
    ).toBeVisible();

    // Pasted text and evidence are saved together.
    await resume.fill(MASTER_RESUME);
    await skills.fill(evidence);
    await save.click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Your Master Profile is saved." }),
    ).toBeVisible();
    await expect(page.getByTestId("master-file-name")).toHaveText(
      "Master Profile",
    );
    await page.reload();
    await expect(skills).toHaveValue(evidence);
    await expect(resume).toHaveValue(/^Ana López/);

    const scan = await new AxeBuilder({ page }).withTags(A11Y_TAGS).analyze();
    expect(scan.violations).toEqual([]);

    // Uploading a file replaces the text and keeps the evidence.
    await uploadMaster(
      page,
      MASTER_RESUME.replace("Ana López", "Ana M. López"),
    );
    await expect(page.getByTestId("master-file-name")).toHaveText("ana.docx");
    await expect(resume).toHaveValue(/^Ana M\. López/);
    await expect(skills).toHaveValue(evidence);
  });

  test("explains files it can't read", async ({ page, request }, testInfo) => {
    await signedInUser(page, request, testInfo.project.name);
    await page.goto("/resume");
    const input = page.locator('input[type="file"]');

    await input.setInputFiles({
      name: "resume.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("Just some text pretending to be a PDF."),
    });
    await expect(
      page.getByRole("alert").filter({ hasText: "isn't a PDF or a Word" }),
    ).toBeVisible();

    const blank = await PDFDocument.create();
    blank.addPage();
    await input.setInputFiles({
      name: "scan.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(await blank.save()),
    });
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "couldn't find any text in that PDF" }),
    ).toBeVisible();
    await expect(
      page.getByText("Set up your Master Profile to tailor resumes"),
    ).toBeVisible();
  });

  test("reviews, edits, saves and downloads; versions and the master are kept apart", async ({
    page,
    request,
    isMobile,
  }, testInfo) => {
    await signedInUser(page, request, testInfo.project.name);
    await page.goto("/resume");
    await uploadMaster(page);
    await expect(page.getByTestId("master-file-name")).toHaveText("ana.docx");

    // Track the job, so saving links the resume to its tracker card.
    await page.goto(`/jobs/${MICRO1_JOB}`);
    await page
      .getByTestId("job-actions")
      .filter({ visible: true })
      .getByRole("button", { name: "Track this" })
      .click();
    await expect(
      page
        .getByTestId("job-actions")
        .filter({ visible: true })
        .getByRole("link", { name: "Tracked: open your dashboard" }),
    ).toBeVisible();

    const first = await createDraft(page, request, MICRO1_JOB);
    await page.goto(`/resume/${first}`);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "French Translator at micro1",
      }),
    ).toBeVisible();
    await expect(page.getByText("Draft, not saved yet")).toBeVisible();
    await expect(
      page.getByText("Check every fact before you use this resume"),
    ).toBeVisible();
    await expect(page.getByText("Experience training AI models")).toBeVisible();
    await expect(page).toHaveTitle(/\S/);
    const scan = await new AxeBuilder({ page }).withTags(A11Y_TAGS).analyze();
    expect(scan.violations).toEqual([]);

    await page.getByLabel("Summary", { exact: true }).fill("Edited summary.");
    await expect(page.getByText("You have unsaved changes.")).toBeVisible();
    await page.getByRole("button", { name: "Save Tailored Resume" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Saved." }),
    ).toBeVisible();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();

    const word = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download Word" }).click();
    expect((await word).suggestedFilename()).toBe(
      "Ana López - French Translator.docx",
    );
    const pdf = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download PDF" }).click();
    expect((await pdf).suggestedFilename()).toBe(
      "Ana López - French Translator.pdf",
    );

    // The job page knows, and the tracker card links to it.
    await page.goto(`/jobs/${MICRO1_JOB}`);
    const panel = page.getByRole("region", { name: "Tailored resume" });
    await expect(panel).toContainText("Tailored resume saved (version 1");
    await expect(panel.getByRole("link", { name: "View" })).toHaveAttribute(
      "href",
      `/resume/${first}`,
    );
    await page.goto("/dashboard");
    if (isMobile) await page.getByRole("tab", { name: /Saved/ }).click();
    await page
      .getByRole("button", { name: "French Translator", exact: true })
      .filter({ visible: true })
      .click();
    const sheet = page.getByRole("dialog", { name: "French Translator" });
    await expect(
      sheet
        .getByRole("region", { name: "Tailored resume" })
        .getByRole("link", { name: "View" }),
    ).toHaveAttribute("href", `/resume/${first}`);
    await page.keyboard.press("Escape");

    // Tailoring again adds version 2 and leaves version 1 alone.
    const second = await createDraft(
      page,
      request,
      MICRO1_JOB,
      "Second draft.",
    );
    await page.goto("/resume");
    const items = page
      .getByRole("listitem")
      .filter({ hasText: "French Translator" });
    await expect(items).toHaveCount(2);
    await expect(items.filter({ hasText: "version 2" })).toContainText("Draft");
    await expect(items.filter({ hasText: "version 1" })).toContainText("Saved");

    // Replacing the master resume changes neither saved version.
    await uploadMaster(
      page,
      `${MASTER_RESUME}\nVolunteer tutor, 2024.`,
      "ana-2026.docx",
    );
    await expect(page.getByTestId("master-file-name")).toHaveText(
      "ana-2026.docx",
    );
    await page.goto(`/resume/${first}`);
    await expect(page.getByLabel("Summary", { exact: true })).toHaveValue(
      "Edited summary.",
    );
    await page.goto(`/jobs/${MICRO1_JOB}`);
    await expect(
      page.getByRole("region", { name: "Tailored resume" }),
    ).toContainText(
      "Your Master Profile has changed since this version was made.",
    );

    // Cancelling a draft deletes only that draft.
    await page.goto(`/resume/${second}`);
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Discard draft" }).click();
    await expect(page).toHaveURL(new RegExp(`/jobs/${MICRO1_JOB}$`));
    await page.goto("/resume");
    await expect(
      page.getByRole("listitem").filter({ hasText: "French Translator" }),
    ).toHaveCount(1);
  });

  test("keeps resumes private to their owner", async ({
    page,
    request,
    browser,
  }, testInfo) => {
    await signedInUser(page, request, testInfo.project.name);
    await page.goto("/resume");
    await uploadMaster(page);
    await expect(page.getByTestId("master-file-name")).toHaveText("ana.docx");
    const id = await createDraft(page, request, MICRO1_JOB);

    // Signed out: no file.
    const anonymous = await request.get(
      `/api/resumes/${id}/download?format=docx`,
    );
    expect(anonymous.status()).toBe(401);

    // Another user: the page and the file are "not found", like unknown ids.
    const context = await browser.newContext();
    const other = await context.newPage();
    await signedInUser(other, other.request, testInfo.project.name);
    const response = await other.goto(`/resume/${id}`);
    expect(response?.status()).toBe(404);
    const file = await other.request.get(
      `/api/resumes/${id}/download?format=pdf`,
    );
    expect(file.status()).toBe(404);
    await other.goto("/resume");
    await expect(
      other.getByText("Set up your Master Profile to tailor resumes"),
    ).toBeVisible();
    await expect(other.getByText("No tailored resumes yet")).toBeVisible();
    await context.close();
  });

  test("deletes the master resume", async ({ page, request }, testInfo) => {
    await signedInUser(page, request, testInfo.project.name);
    await page.goto("/resume");
    await uploadMaster(page);
    await expect(page.getByTestId("master-file-name")).toHaveText("ana.docx");

    await page.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete Master Profile" }).click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Your Master Profile is deleted." }),
    ).toBeVisible();
    await expect(
      page.getByText("Set up your Master Profile to tailor resumes"),
    ).toBeVisible();
  });
});
