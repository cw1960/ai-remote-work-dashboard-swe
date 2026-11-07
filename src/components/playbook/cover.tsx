import Image from "next/image";

import { cn } from "@/lib/utils";

import cover from "../../../public/playbook/cover.webp";

/** The book's cover (public/playbook/cover.webp, 1253 × 2000). */
export function PlaybookCover({
  label,
  className,
  priority = false,
}: {
  label: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={cover}
      alt={label}
      priority={priority}
      placeholder="blur"
      sizes="(min-width: 1024px) 384px, (min-width: 640px) 320px, 272px"
      className={cn(
        "h-auto w-full rounded-lg border border-white/10 shadow-2xl shadow-black/60",
        className,
      )}
    />
  );
}
