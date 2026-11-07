import {
  EmailButton,
  EmailHeading,
  EmailLayout,
  EmailText,
  type StaffEmailFooter,
} from "./layout";

export interface PlaybookEmailProps {
  lang: string;
  brand: string;
  preview: string;
  heading: string;
  body: string;
  cta: string;
  downloadUrl: string;
  nextStep: string;
  nextCta: string;
  dashboardUrl: string;
  guarantee: string;
  footer: StaffEmailFooter;
}

/** Sent once per purchase of the Playbook: the download link. */
export function PlaybookEmail(props: PlaybookEmailProps) {
  return (
    <EmailLayout
      lang={props.lang}
      brand={props.brand}
      preview={props.preview}
      footer={props.footer}
    >
      <EmailHeading>{props.heading}</EmailHeading>
      <EmailText>{props.body}</EmailText>
      <EmailButton href={props.downloadUrl}>{props.cta}</EmailButton>
      <EmailText>{props.nextStep}</EmailText>
      <EmailButton href={props.dashboardUrl}>{props.nextCta}</EmailButton>
      <EmailText>{props.guarantee}</EmailText>
    </EmailLayout>
  );
}
