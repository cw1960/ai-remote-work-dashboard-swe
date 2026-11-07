import { Fragment } from "react";
import { Text } from "react-email";

import {
  EmailButton,
  EmailHeading,
  EmailLayout,
  EmailText,
  type StaffEmailFooter,
} from "./layout";
import { emailTheme as theme } from "./theme";

export interface DraftItem {
  /** e.g. "LinkedIn", or "Bluesky · posts at 11:30 AM" */
  label: string;
  /** Reddit drafts: the post's title. */
  title?: string;
  body: string;
}

export interface NewsletterDraftsEmailProps {
  lang: string;
  brand: string;
  preview: string;
  heading: string;
  intro: string;
  drafts: DraftItem[];
  cta: string;
  adminUrl: string;
  footer: StaffEmailFooter;
}

/** Social drafts from a newsletter run, ready to copy and post by hand. */
export function NewsletterDraftsEmail(props: NewsletterDraftsEmailProps) {
  return (
    <EmailLayout
      lang={props.lang}
      brand={props.brand}
      preview={props.preview}
      footer={props.footer}
    >
      <EmailHeading>{props.heading}</EmailHeading>
      <EmailText>{props.intro}</EmailText>
      {props.drafts.map((draft, index) => (
        <Text
          key={index}
          style={{
            border: `1px solid ${theme.border}`,
            borderRadius: "10px",
            padding: "10px 14px",
            margin: "0 0 12px",
            fontSize: "15px",
            lineHeight: "1.5",
          }}
        >
          <strong>{draft.label}</strong>
          {draft.title && (
            <>
              <br />
              <strong>{draft.title}</strong>
            </>
          )}
          {draft.body.split("\n").map((line, lineIndex) => (
            <Fragment key={lineIndex}>
              <br />
              {line}
            </Fragment>
          ))}
        </Text>
      ))}
      <Text style={{ margin: "16px 0 0" }}>
        <EmailButton href={props.adminUrl}>{props.cta}</EmailButton>
      </Text>
    </EmailLayout>
  );
}
