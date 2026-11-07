/**
 * The AI Remote Work Playbook (the book sold on its own sub-domain). Price,
 * refund window and download window are set here only.
 */
export const playbookConfig = {
  title: "The AI Remote Work Playbook",
  subtitle:
    "How to Find Opportunities, Pass AI Assessments, and Get Paid to Help Build the Future of AI",
  author: "Cris Lopez, PhD",
  /** The sales page's own address. */
  host: "playbook.airemoteworkdashboard.com",
  url: "https://playbook.airemoteworkdashboard.com",
  /** Price in the smallest currency unit (cents). */
  priceCents: 1900,
  currency: "usd",
  /**
   * Stripe product tax code: digital books, downloaded, with permanent
   * rights. Required because the account uses Stripe Managed Payments
   * (Stripe is the merchant of record and handles sales tax and VAT).
   */
  taxCode: "txcd_10302000",
  /** Money-back guarantee, in days from purchase. */
  refundDays: 30,
  /** How long the download link works after purchase, in days. */
  downloadDays: 90,
  /** The PDF in content/playbook/, outside `public/`: buyers only. */
  pdfFile: "the-ai-remote-work-playbook.pdf",
  pdfFileName: "The-AI-Remote-Work-Playbook.pdf",
  pages: 42,
} as const;
