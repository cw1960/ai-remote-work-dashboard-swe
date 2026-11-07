import { Column, Link, Row, Section, Text } from "react-email";

import {
  EmailButton,
  type EmailFooter,
  EmailHeading,
  EmailLayout,
  EmailText,
} from "./layout";
import { emailTheme as theme } from "./theme";

export interface RecapStat {
  value: string;
  label: string;
}

export interface RecapJob {
  title: string;
  /** e.g. "Mercor · $40–50 / hr" */
  detail: string;
  url: string;
}

export interface RecapEmailProps {
  lang: string;
  brand: string;
  preview: string;
  heading: string;
  intro: string;
  stats: RecapStat[];
  matchesHeading: string;
  matches: RecapJob[];
  cta: string;
  dashboardUrl: string;
  footer: EmailFooter;
}

/** Monday's recap: the past week in numbers and the top matches. */
export function RecapEmail(props: RecapEmailProps) {
  return (
    <EmailLayout
      lang={props.lang}
      brand={props.brand}
      preview={props.preview}
      footer={props.footer}
    >
      <EmailHeading>{props.heading}</EmailHeading>
      <EmailText>{props.intro}</EmailText>
      <Section style={{ margin: "8px 0 0" }}>
        <Row>
          {props.stats.map((stat, index) => (
            <Column
              key={index}
              style={{
                border: `1px solid ${theme.border}`,
                borderRadius: "10px",
                padding: "10px 12px",
                textAlign: "center",
                width: `${String(Math.floor(100 / props.stats.length))}%`,
              }}
            >
              <Text style={{ fontSize: "22px", fontWeight: 800, margin: 0 }}>
                {stat.value}
              </Text>
              <Text style={{ fontSize: "12px", color: theme.muted, margin: 0 }}>
                {stat.label}
              </Text>
            </Column>
          ))}
        </Row>
      </Section>
      {props.matches.length > 0 && (
        <Section style={{ margin: "20px 0 0" }}>
          <Text
            style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 8px" }}
          >
            {props.matchesHeading}
          </Text>
          {props.matches.map((job, index) => (
            <Text
              key={index}
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
        </Section>
      )}
      <Text style={{ margin: "16px 0 0" }}>
        <EmailButton href={props.dashboardUrl}>{props.cta}</EmailButton>
      </Text>
    </EmailLayout>
  );
}
