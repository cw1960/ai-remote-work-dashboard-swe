import { useTranslations } from "next-intl";

import { DetailNotFound } from "@/components/detail-not-found";

export default function PlatformNotFound() {
  const t = useTranslations("PlatformPage");
  return (
    <DetailNotFound
      title={t("notFound")}
      copy={t("notFoundBody")}
      action={t("browseAll")}
    />
  );
}
