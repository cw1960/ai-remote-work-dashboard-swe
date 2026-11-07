import type { ReactNode } from "react";
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "react-email";

import { emailTheme as theme } from "./theme";

export interface EmailFooter {
  /** Why this email was sent. */
  reason: string;
  unsubscribeLabel: string;
  unsubscribeUrl: string;
  settingsLabel: string;
  settingsUrl: string;
}

/** The footer of an email to the team (no list to unsubscribe from). */
export interface StaffEmailFooter {
  reason: string;
}

/** The frame every email shares: brand, content card and footer links. */
export function EmailLayout({
  lang,
  brand,
  preview,
  footer,
  children,
}: {
  lang: string;
  brand: string;
  preview: string;
  footer: EmailFooter | StaffEmailFooter;
  children: ReactNode;
}) {
  return (
    <Html lang={lang}>
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: theme.background,
          color: theme.text,
          fontFamily: theme.font,
          margin: 0,
          padding: "24px 0",
        }}
      >
        <Container style={{ maxWidth: "560px", padding: "0 16px" }}>
          <Text
            style={{
              fontSize: "14px",
              fontWeight: 700,
              color: theme.primary,
              margin: "0 0 12px",
            }}
          >
            {brand}
          </Text>
          <Section
            style={{
              backgroundColor: theme.surface,
              border: `1px solid ${theme.border}`,
              borderRadius: theme.radius,
              padding: "28px 24px",
            }}
          >
            {children}
          </Section>
          <Hr style={{ borderColor: theme.border, margin: "24px 0 12px" }} />
          <Text style={{ fontSize: "12px", color: theme.muted, margin: 0 }}>
            {footer.reason}
          </Text>
          {"unsubscribeUrl" in footer && (
            <Text
              style={{
                fontSize: "12px",
                color: theme.muted,
                margin: "8px 0 0",
              }}
            >
              <Link href={footer.unsubscribeUrl} style={{ color: theme.muted }}>
                {footer.unsubscribeLabel}
              </Link>
              {" · "}
              <Link href={footer.settingsUrl} style={{ color: theme.muted }}>
                {footer.settingsLabel}
              </Link>
            </Text>
          )}
        </Container>
      </Body>
    </Html>
  );
}

export function EmailHeading({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        fontSize: "22px",
        lineHeight: "1.3",
        fontWeight: 800,
        margin: "0 0 12px",
      }}
    >
      {children}
    </Text>
  );
}

export function EmailText({ children }: { children: ReactNode }) {
  return (
    <Text style={{ fontSize: "15px", lineHeight: "1.6", margin: "0 0 16px" }}>
      {children}
    </Text>
  );
}

export function EmailButton({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "inline-block",
        backgroundColor: theme.primary,
        color: theme.primaryText,
        borderRadius: "10px",
        fontSize: "15px",
        fontWeight: 700,
        padding: "12px 20px",
        textDecoration: "none",
      }}
    >
      {children}
    </Link>
  );
}
