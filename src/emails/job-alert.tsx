import { Link, Section, Text } from "react-email";

import {
  type EmailFooter,
  EmailHeading,
  EmailLayout,
  EmailText,
} from "./layout";
import { emailTheme as theme } from "./theme";

export interface AlertJob {
  title: string;
  /** e.g. "Mercor · $40–50 / hr" */
  detail: string;
  url: string;
}

export interface AlertSearch {
  /** The search in words. */
  description: string;
  /** e.g. "3 new jobs" */
  countLabel: string;
  jobs: AlertJob[];
  /** Shown when there are more matches than jobs listed. */
  seeAll: { label: string; url: string } | null;
}

export interface JobAlertEmailProps {
  lang: string;
  brand: string;
  preview: string;
  heading: string;
  intro: string;
  searches: AlertSearch[];
  footer: EmailFooter;
}

/** New jobs for one person's due saved searches, one section per search. */
export function JobAlertEmail(props: JobAlertEmailProps) {
  return (
    <EmailLayout
      lang={props.lang}
      brand={props.brand}
      preview={props.preview}
      footer={props.footer}
    >
      <EmailHeading>{props.heading}</EmailHeading>
      <EmailText>{props.intro}</EmailText>
      {props.searches.map((search, index) => (
        <Section key={index} style={{ margin: "20px 0 0" }}>
          <Text style={{ fontSize: "16px", fontWeight: 700, margin: "0" }}>
            {search.description}
          </Text>
          <Text
            style={{ fontSize: "13px", color: theme.muted, margin: "0 0 8px" }}
          >
            {search.countLabel}
          </Text>
          {search.jobs.map((job, jobIndex) => (
            <Text
              key={jobIndex}
              style={{
                border: `1px solid ${theme.border}`,
                borderRadius: "10px",
                padding: "10px 14px",
                margin: "0 0 8px",
                fontSize: "15px",
                lineHeight: "1.4",
              }}
            >
              <Link
                href={job.url}
                style={{ color: theme.text, fontWeight: 700 }}
              >
                {job.title}
              </Link>
              <br />
              <span style={{ color: theme.muted, fontSize: "13px" }}>
                {job.detail}
              </span>
            </Text>
          ))}
          {search.seeAll && (
            <Text style={{ margin: "4px 0 0", fontSize: "14px" }}>
              <Link
                href={search.seeAll.url}
                style={{ color: theme.primary, fontWeight: 700 }}
              >
                {search.seeAll.label}
              </Link>
            </Text>
          )}
        </Section>
      ))}
    </EmailLayout>
  );
}
