import { Text } from "react-email";

import {
  EmailButton,
  EmailHeading,
  EmailLayout,
  EmailText,
  type EmailFooter,
} from "./layout";
import { emailTheme as theme } from "./theme";

export interface ReminderCard {
  title: string;
  /** e.g. "Applied · Mercor" */
  detail: string;
}

export interface ReminderEmailProps {
  lang: string;
  brand: string;
  preview: string;
  heading: string;
  intro: string;
  cards: ReminderCard[];
  cta: string;
  dashboardUrl: string;
  footer: EmailFooter;
}

/** The daily email listing cards whose follow-up day is today. */
export function ReminderEmail(props: ReminderEmailProps) {
  return (
    <EmailLayout
      lang={props.lang}
      brand={props.brand}
      preview={props.preview}
      footer={props.footer}
    >
      <EmailHeading>{props.heading}</EmailHeading>
      <EmailText>{props.intro}</EmailText>
      {props.cards.map((card, index) => (
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
          <strong>{card.title}</strong>
          <br />
          <span style={{ color: theme.muted, fontSize: "13px" }}>
            {card.detail}
          </span>
        </Text>
      ))}
      <Text style={{ margin: "16px 0 0" }}>
        <EmailButton href={props.dashboardUrl}>{props.cta}</EmailButton>
      </Text>
    </EmailLayout>
  );
}
