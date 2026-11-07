/**
 * Email-safe equivalents of the design tokens (src/styles/tokens.css).
 * Email clients don't support oklch() or CSS variables, so these are hex.
 * Emails use a light surface: many clients force light backgrounds.
 */
export const emailTheme = {
  background: "#f4f4f8",
  surface: "#ffffff",
  text: "#1c1c2b",
  muted: "#5f6072",
  border: "#e3e3ec",
  primary: "#6366f1",
  primaryText: "#ffffff",
  radius: "12px",
  font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
} as const;
