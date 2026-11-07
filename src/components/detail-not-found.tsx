import { Search } from "lucide-react";

import { AccountNav } from "@/components/account-nav";
import { SiteHeader } from "@/components/site-header";
import { StateBlock } from "@/components/state-block";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/** Body of a detail route's not-found.tsx, with a way back to the feed. */
export function DetailNotFound({
  title,
  copy,
  action,
}: {
  title: string;
  copy: string;
  action: string;
}) {
  return (
    <>
      <SiteHeader>
        <AccountNav />
      </SiteHeader>
      <main
        id="main"
        className="mx-auto w-full max-w-3xl flex-1 px-4 py-16 sm:px-6"
      >
        <StateBlock
          icon={Search}
          title={title}
          headingLevel={1}
          copy={copy}
          action={
            <Button asChild variant="editorial" size="touch">
              <Link href="/">{action}</Link>
            </Button>
          }
        />
      </main>
    </>
  );
}
