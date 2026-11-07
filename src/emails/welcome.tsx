import {
  EmailButton,
  EmailHeading,
  EmailLayout,
  EmailText,
  type EmailFooter,
} from "./layout";

export interface WelcomeEmailProps {
  lang: string;
  brand: string;
  preview: string;
  heading: string;
  body: string;
  tip: string;
  cta: string;
  dashboardUrl: string;
  footer: EmailFooter;
}

/** Sent once, when someone finishes (or skips) onboarding. */
export function WelcomeEmail(props: WelcomeEmailProps) {
  return (
    <EmailLayout
      lang={props.lang}
      brand={props.brand}
      preview={props.preview}
      footer={props.footer}
    >
      <EmailHeading>{props.heading}</EmailHeading>
      <EmailText>{props.body}</EmailText>
      <EmailText>{props.tip}</EmailText>
      <EmailButton href={props.dashboardUrl}>{props.cta}</EmailButton>
    </EmailLayout>
  );
}
