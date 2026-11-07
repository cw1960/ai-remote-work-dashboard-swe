import { render } from "react-email";
import { describe, expect, it } from "vitest";

import { JobAlertEmail } from "./job-alert";
import { NewsletterDraftsEmail } from "./newsletter-drafts";
import { RecapEmail } from "./recap";
import { ReminderEmail } from "./reminder";
import { WelcomeEmail } from "./welcome";

const footer = {
  reason: "Why you got this",
  unsubscribeLabel: "Unsubscribe",
  unsubscribeUrl: "https://example.com/unsubscribe?token=abc",
  settingsLabel: "Email settings",
  settingsUrl: "https://example.com/settings",
};

describe("email templates", () => {
  it("renders newsletter drafts line by line, with no unsubscribe link", async () => {
    const element = (
      <NewsletterDraftsEmail
        lang="en"
        brand="Newsletter"
        preview="Preview"
        heading="This week's data post"
        intro="Intro"
        drafts={[{ label: "LinkedIn", body: "First line\nSecond <line>" }]}
        cta="Open in the admin area"
        adminUrl="https://example.com/admin/newsletter"
        footer={{ reason: "Only admins receive these" }}
      />
    );
    const html = await render(element);
    expect(html).toContain("Second &lt;line&gt;");
    expect(html).toContain('href="https://example.com/admin/newsletter"');
    expect(html).not.toContain("unsubscribe");
    const text = await render(element, { plainText: true });
    expect(text).toContain("LinkedIn\nFirst line\nSecond <line>");
  });

  it("shows a Reddit draft's title above its body", async () => {
    const text = await render(
      <NewsletterDraftsEmail
        lang="en"
        brand="Newsletter"
        preview="Preview"
        heading="Today's social posts"
        intro="Intro"
        drafts={[{ label: "Reddit", title: "Today's roles", body: "Roles" }]}
        cta="Open in the admin area"
        adminUrl="https://example.com/admin/newsletter"
        footer={{ reason: "Only admins receive these" }}
      />,
      { plainText: true },
    );
    expect(text).toContain("Reddit\nToday's roles\nRoles");
  });

  it("renders the welcome email with its links", async () => {
    const html = await render(
      <WelcomeEmail
        lang="en"
        brand="Brand"
        preview="Preview"
        heading="Welcome aboard"
        body="Body"
        tip="Tip"
        cta="Open my dashboard"
        dashboardUrl="https://example.com/dashboard"
        footer={footer}
      />,
    );
    expect(html).toContain('lang="en"');
    expect(html).toContain("Welcome aboard");
    expect(html).toContain('href="https://example.com/dashboard"');
    expect(html).toContain('href="https://example.com/unsubscribe?token=abc"');
    expect(html).toContain('href="https://example.com/settings"');
  });

  it("renders one line per due card, in plain text too", async () => {
    const element = (
      <ReminderEmail
        lang="en"
        brand="Brand"
        preview="Preview"
        heading="Time to follow up"
        intro="These are due"
        cards={[
          { title: "Litigation Associate", detail: "Applied · Mercor" },
          { title: "Acme <direct>", detail: "Saved" },
        ]}
        cta="Open my dashboard"
        dashboardUrl="https://example.com/dashboard"
        footer={footer}
      />
    );
    const html = await render(element);
    expect(html).toContain("Litigation Associate");
    expect(html).toContain("Acme &lt;direct&gt;");
    const text = await render(element, { plainText: true });
    expect(text).toContain("Applied · Mercor");
    expect(text).toContain("Unsubscribe");
  });

  it("renders each search with its jobs and a see-all link", async () => {
    const html = await render(
      <JobAlertEmail
        lang="en"
        brand="Brand"
        preview="Preview"
        heading="3 new jobs for you"
        intro="Intro"
        searches={[
          {
            description: "Law · Spanish",
            countLabel: "12 new jobs",
            jobs: [
              {
                title: "Contract Lawyer",
                detail: "Mercor · $40–50 / hr",
                url: "https://example.com/jobs/1",
              },
            ],
            seeAll: {
              label: "See all 12 new jobs",
              url: "https://example.com/?domain=law",
            },
          },
          {
            description: "All new jobs",
            countLabel: "1 new job",
            jobs: [
              {
                title: "Tutor",
                detail: "micro1",
                url: "https://example.com/jobs/2",
              },
            ],
            seeAll: null,
          },
        ]}
        footer={footer}
      />,
    );
    expect(html).toContain("Law · Spanish");
    expect(html).toContain('href="https://example.com/jobs/1"');
    expect(html).toContain("See all 12 new jobs");
    expect(html.match(/See all/g)).toHaveLength(1);
  });

  it("renders the recap's numbers and matches, without an empty matches block", async () => {
    const props = {
      lang: "en",
      brand: "Brand",
      preview: "Preview",
      heading: "Your week",
      intro: "Intro",
      stats: [
        { value: "3", label: "Applications" },
        { value: "1", label: "Response" },
      ],
      matchesHeading: "Top matches for you",
      cta: "Open my dashboard",
      dashboardUrl: "https://example.com/dashboard",
      footer,
    };
    const html = await render(
      <RecapEmail
        {...props}
        matches={[
          {
            title: "Contract Lawyer",
            detail: "Mercor · $40–50 / hr",
            url: "https://example.com/jobs/1",
          },
        ]}
      />,
    );
    expect(html).toContain("Applications");
    expect(html).toContain("Top matches for you");
    expect(html).toContain('href="https://example.com/jobs/1"');

    const empty = await render(<RecapEmail {...props} matches={[]} />);
    expect(empty).not.toContain("Top matches for you");
    expect(empty).toContain('href="https://example.com/dashboard"');
  });
});
