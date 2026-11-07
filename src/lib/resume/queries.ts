import "server-only";

import { cache } from "react";

import {
  type Resume,
  storedResumeSchema,
  type StoredReview,
  storedReviewSchema,
} from "../../../supabase/functions/_shared/resume/schema";
import { getSessionUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Resume reads. Every query runs as the signed-in user, so RLS limits them
 * to the user's own rows; the user_id filters only help the planner.
 */

export interface MasterResumeSummary {
  id: string;
  fileName: string;
  /** "text" when typed or pasted on the Master Profile page. */
  fileType: "pdf" | "docx" | "text";
  updatedAt: string;
  characters: number;
}

/** The master profile: the resume text and the core skills and evidence. */
export interface MasterProfile extends MasterResumeSummary {
  content: string;
  evidence: string;
}

function toFileType(value: string): MasterResumeSummary["fileType"] {
  return value === "docx" || value === "text" ? value : "pdf";
}

/** The active master resume (without its text), or null. */
export const getMasterResume = cache(
  async (): Promise<MasterResumeSummary | null> => {
    const user = await getSessionUser();
    if (!user) return null;
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("master_resumes")
      .select("id, file_name, file_type, created_at, content")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return {
      id: data.id,
      fileName: data.file_name,
      fileType: toFileType(data.file_type),
      updatedAt: data.created_at,
      characters: data.content.length,
    };
  },
);

/**
 * The signed-in user's active master profile, with its text, or null when
 * they have none (or are signed out).
 */
export async function getMasterProfile(): Promise<MasterProfile | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createSupabaseServerClient();
  const withEvidence = await supabase
    .from("master_resumes")
    .select("id, file_name, file_type, created_at, content, evidence")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  // Undefined column: the site went live before the Master Profile
  // migration was applied. Show the resume without evidence until it is.
  const { data, error } =
    withEvidence.error?.code === "42703"
      ? await supabase
          .from("master_resumes")
          .select("id, file_name, file_type, created_at, content")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .maybeSingle()
      : withEvidence;
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: data.id,
    fileName: data.file_name,
    fileType: toFileType(data.file_type),
    updatedAt: data.created_at,
    characters: data.content.length,
    content: data.content,
    evidence: "evidence" in data ? String(data.evidence) : "",
  };
}

/** The text of a master resume version the user owns, for comparison. */
export async function getMasterResumeText(id: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("master_resumes")
    .select("content")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.content ?? null;
}

export interface TailoredResumeSummary {
  id: string;
  jobId: string;
  jobTitle: string;
  company: string;
  version: number;
  status: "draft" | "saved";
  masterResumeId: string | null;
  createdAt: string;
  updatedAt: string;
  savedAt: string | null;
}

export interface TailoredResume extends TailoredResumeSummary {
  resume: Resume;
  review: StoredReview;
}

const SUMMARY_COLUMNS =
  "id, job_id, job_title, company, version, status, master_resume_id, created_at, updated_at, saved_at";

interface SummaryRow {
  id: string;
  job_id: string;
  job_title: string;
  company: string;
  version: number;
  status: "draft" | "saved";
  master_resume_id: string | null;
  created_at: string;
  updated_at: string;
  saved_at: string | null;
}

function toSummary(row: SummaryRow): TailoredResumeSummary {
  return {
    id: row.id,
    jobId: row.job_id,
    jobTitle: row.job_title,
    company: row.company,
    version: row.version,
    status: row.status,
    masterResumeId: row.master_resume_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    savedAt: row.saved_at,
  };
}

/** One of the user's tailored resumes, or null (unknown or not theirs). */
export async function getTailoredResume(
  id: string,
): Promise<TailoredResume | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tailored_resumes")
    .select(`${SUMMARY_COLUMNS}, content, review`)
    .eq("user_id", user.id)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const resume = storedResumeSchema.safeParse(data.content);
  const review = storedReviewSchema.safeParse(data.review);
  if (!resume.success || !review.success) {
    throw new Error(`tailored resume ${id} does not match its schema`);
  }
  return { ...toSummary(data), resume: resume.data, review: review.data };
}

/** The user's tailored resumes, newest first; optionally for one job. */
export async function listTailoredResumes(
  jobId?: string,
): Promise<TailoredResumeSummary[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("tailored_resumes")
    .select(SUMMARY_COLUMNS)
    .eq("user_id", user.id);
  if (jobId) query = query.eq("job_id", jobId);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data.map(toSummary);
}

export type TailorStatus =
  /** Signed out: the button leads to sign-in. */
  | { kind: "signed_out" }
  /** Signed in, nothing saved for this job yet (drafts may exist). */
  | { kind: "none"; hasMaster: boolean; draft: TailoredResumeSummary | null }
  /**
   * A saved version exists. `outdated` when the master resume changed
   * after it was made, so a new version would use newer experience.
   */
  | {
      kind: "saved";
      hasMaster: boolean;
      latest: TailoredResumeSummary;
      outdated: boolean;
    };

/** What the job page shows next to "Tailor My Resume for This Job". */
export async function getTailorStatus(jobId: string): Promise<TailorStatus> {
  const user = await getSessionUser();
  if (!user) return { kind: "signed_out" };
  const [master, versions] = await Promise.all([
    getMasterResume(),
    listTailoredResumes(jobId),
  ]);
  const latest = versions.find((version) => version.status === "saved");
  if (!latest) {
    return {
      kind: "none",
      hasMaster: master !== null,
      draft: versions.find((version) => version.status === "draft") ?? null,
    };
  }
  return {
    kind: "saved",
    hasMaster: master !== null,
    latest,
    outdated: master !== null && latest.masterResumeId !== master.id,
  };
}

/** Generations used in the last 24 hours, and the limit. */
export async function getTailoringUsage(): Promise<{
  used: number;
  limit: number;
}> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("resume_tailoring_usage");
  if (error) throw new Error(error.message);
  const row = data[0];
  return { used: row?.used ?? 0, limit: row?.daily_limit ?? 0 };
}
