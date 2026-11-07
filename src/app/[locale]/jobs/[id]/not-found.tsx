import { useTranslations } from "next-intl";

import { DetailNotFound } from "@/components/detail-not-found";

export default function JobNotFound() {
  const t = useTranslations("JobPage");
  return (
    <DetailNotFound
      title={t("notFound")}
      copy={t("notFoundBody")}
      action={t("backToJobs")}
    />
  );
}
