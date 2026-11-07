import { NextResponse, type NextRequest } from "next/server";

import { playbookPath, seeOther } from "@/lib/playbook/paths";
import { parsePlaybookRef } from "@/lib/playbook/promo";
import { checkoutEnabled, createCheckoutSession } from "@/lib/playbook/stripe";

/**
 * POST /api/playbook/checkout — the sales page's buy buttons (plain form
 * posts, so they work without JavaScript). Sends the buyer to Stripe
 * Checkout, or back to the page with a reason when it can't.
 */
export async function POST(request: NextRequest) {
  const back = (reason: string) =>
    seeOther(
      `${playbookPath(request.headers.get("host"))}?checkout=${reason}#buy`,
    );
  if (!checkoutEnabled()) return back("unavailable");
  const form = await request.formData().catch(() => null);
  const ref = parsePlaybookRef(form?.get("ref"));
  try {
    return NextResponse.redirect(await createCheckoutSession(ref), 303);
  } catch (error) {
    console.error("playbook checkout failed", error);
    return back("error");
  }
}
