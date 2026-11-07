export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      card_events: {
        Row: {
          at: string;
          card_id: string;
          from_stage: Database["public"]["Enums"]["card_stage"] | null;
          id: number;
          source: Database["public"]["Enums"]["card_event_source"];
          to_stage: Database["public"]["Enums"]["card_stage"];
          user_id: string;
        };
        Insert: {
          at?: string;
          card_id: string;
          from_stage?: Database["public"]["Enums"]["card_stage"] | null;
          id?: never;
          source?: Database["public"]["Enums"]["card_event_source"];
          to_stage: Database["public"]["Enums"]["card_stage"];
          user_id: string;
        };
        Update: {
          at?: string;
          card_id?: string;
          from_stage?: Database["public"]["Enums"]["card_stage"] | null;
          id?: never;
          source?: Database["public"]["Enums"]["card_event_source"];
          to_stage?: Database["public"]["Enums"]["card_stage"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "card_events_card_id_fkey";
            columns: ["card_id"];
            isOneToOne: false;
            referencedRelation: "tracker_cards";
            referencedColumns: ["id"];
          },
        ];
      };
      email_prefs: {
        Row: {
          alerts_on: boolean;
          created_at: string;
          inbound_token: string;
          last_recap_on: string | null;
          last_reminder_on: string | null;
          recap_on: boolean;
          reminders_on: boolean;
          unsubscribe_token: string;
          updated_at: string;
          user_id: string;
          welcomed_at: string | null;
        };
        Insert: {
          alerts_on?: boolean;
          created_at?: string;
          inbound_token?: string;
          last_recap_on?: string | null;
          last_reminder_on?: string | null;
          recap_on?: boolean;
          reminders_on?: boolean;
          unsubscribe_token?: string;
          updated_at?: string;
          user_id?: string;
          welcomed_at?: string | null;
        };
        Update: {
          alerts_on?: boolean;
          created_at?: string;
          inbound_token?: string;
          last_recap_on?: string | null;
          last_reminder_on?: string | null;
          recap_on?: boolean;
          reminders_on?: boolean;
          unsubscribe_token?: string;
          updated_at?: string;
          user_id?: string;
          welcomed_at?: string | null;
        };
        Relationships: [];
      };
      inbound_emails: {
        Row: {
          card_id: string | null;
          created_at: string;
          from_domain: string;
          id: string;
          matched_platform_id: string | null;
          matched_stage: Database["public"]["Enums"]["card_stage"] | null;
          received_at: string;
          status: Database["public"]["Enums"]["inbound_status"];
          subject: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          card_id?: string | null;
          created_at?: string;
          from_domain: string;
          id?: string;
          matched_platform_id?: string | null;
          matched_stage?: Database["public"]["Enums"]["card_stage"] | null;
          received_at?: string;
          status?: Database["public"]["Enums"]["inbound_status"];
          subject?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          card_id?: string | null;
          created_at?: string;
          from_domain?: string;
          id?: string;
          matched_platform_id?: string | null;
          matched_stage?: Database["public"]["Enums"]["card_stage"] | null;
          received_at?: string;
          status?: Database["public"]["Enums"]["inbound_status"];
          subject?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inbound_emails_card_id_fkey";
            columns: ["card_id"];
            isOneToOne: false;
            referencedRelation: "tracker_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inbound_emails_matched_platform_id_fkey";
            columns: ["matched_platform_id"];
            isOneToOne: false;
            referencedRelation: "platforms";
            referencedColumns: ["id"];
          },
        ];
      };
      ingest_runs: {
        Row: {
          closed: number;
          error: string | null;
          finished_at: string | null;
          found: number;
          id: number;
          inserted: number;
          platform_id: string;
          skipped: number;
          started_at: string;
          updated: number;
        };
        Insert: {
          closed?: number;
          error?: string | null;
          finished_at?: string | null;
          found?: number;
          id?: never;
          inserted?: number;
          platform_id: string;
          skipped?: number;
          started_at?: string;
          updated?: number;
        };
        Update: {
          closed?: number;
          error?: string | null;
          finished_at?: string | null;
          found?: number;
          id?: never;
          inserted?: number;
          platform_id?: string;
          skipped?: number;
          started_at?: string;
          updated?: number;
        };
        Relationships: [
          {
            foreignKeyName: "ingest_runs_platform_id_fkey";
            columns: ["platform_id"];
            isOneToOne: false;
            referencedRelation: "platforms";
            referencedColumns: ["id"];
          },
        ];
      };
      jobs: {
        Row: {
          closed_at: string | null;
          countries: string[];
          countries_blocked: string[];
          created_at: string;
          domain: string | null;
          external_id: string;
          first_seen_at: string;
          id: string;
          languages: string[];
          last_seen_at: string;
          newsletter_only: boolean;
          pay_max: number | null;
          pay_min: number | null;
          pay_unit: Database["public"]["Enums"]["pay_unit"] | null;
          platform_id: string;
          posted_at: string | null;
          review_of: string | null;
          source: string;
          status: Database["public"]["Enums"]["job_status"];
          summary: string | null;
          tags: string[];
          title: string;
          updated_at: string;
          url: string;
          verified_at: string | null;
        };
        Insert: {
          closed_at?: string | null;
          countries?: string[];
          countries_blocked?: string[];
          created_at?: string;
          domain?: string | null;
          external_id: string;
          first_seen_at?: string;
          id?: string;
          languages?: string[];
          last_seen_at?: string;
          newsletter_only?: boolean;
          pay_max?: number | null;
          pay_min?: number | null;
          pay_unit?: Database["public"]["Enums"]["pay_unit"] | null;
          platform_id: string;
          posted_at?: string | null;
          review_of?: string | null;
          source?: string;
          status?: Database["public"]["Enums"]["job_status"];
          summary?: string | null;
          tags?: string[];
          title: string;
          updated_at?: string;
          url: string;
          verified_at?: string | null;
        };
        Update: {
          closed_at?: string | null;
          countries?: string[];
          countries_blocked?: string[];
          created_at?: string;
          domain?: string | null;
          external_id?: string;
          first_seen_at?: string;
          id?: string;
          languages?: string[];
          last_seen_at?: string;
          newsletter_only?: boolean;
          pay_max?: number | null;
          pay_min?: number | null;
          pay_unit?: Database["public"]["Enums"]["pay_unit"] | null;
          platform_id?: string;
          posted_at?: string | null;
          review_of?: string | null;
          source?: string;
          status?: Database["public"]["Enums"]["job_status"];
          summary?: string | null;
          tags?: string[];
          title?: string;
          updated_at?: string;
          url?: string;
          verified_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "jobs_review_of_fkey";
            columns: ["review_of"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "jobs_platform_id_fkey";
            columns: ["platform_id"];
            isOneToOne: false;
            referencedRelation: "platforms";
            referencedColumns: ["id"];
          },
        ];
      };
      master_resumes: {
        Row: {
          content: string;
          created_at: string;
          evidence: string;
          file_name: string;
          file_size: number;
          file_type: string;
          id: string;
          is_active: boolean;
          user_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          evidence?: string;
          file_name: string;
          file_size: number;
          file_type: string;
          id?: string;
          is_active?: boolean;
          user_id?: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          evidence?: string;
          file_name?: string;
          file_size?: number;
          file_type?: string;
          id?: string;
          is_active?: boolean;
          user_id?: string;
        };
        Relationships: [];
      };
      outbound_clicks: {
        Row: {
          at: string;
          id: number;
          job_id: string;
          referrer_used: boolean;
          user_id: string | null;
        };
        Insert: {
          at?: string;
          id?: never;
          job_id: string;
          referrer_used: boolean;
          user_id?: string | null;
        };
        Update: {
          at?: string;
          id?: never;
          job_id?: string;
          referrer_used?: boolean;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "outbound_clicks_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_memberships: {
        Row: {
          applied_at: string | null;
          created_at: string;
          id: string;
          notes: string | null;
          platform_id: string;
          reapply_after: string | null;
          status: Database["public"]["Enums"]["membership_status"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          applied_at?: string | null;
          created_at?: string;
          id?: string;
          notes?: string | null;
          platform_id: string;
          reapply_after?: string | null;
          status?: Database["public"]["Enums"]["membership_status"];
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          applied_at?: string | null;
          created_at?: string;
          id?: string;
          notes?: string | null;
          platform_id?: string;
          reapply_after?: string | null;
          status?: Database["public"]["Enums"]["membership_status"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "platform_memberships_platform_id_fkey";
            columns: ["platform_id"];
            isOneToOne: false;
            referencedRelation: "platforms";
            referencedColumns: ["id"];
          },
        ];
      };
      platforms: {
        Row: {
          countries_blocked: string[];
          created_at: string;
          email_domains: string[];
          has_referral: boolean;
          id: string;
          listed: boolean;
          name: string;
          newsletter_only: boolean;
          onboarding_notes: string | null;
          referral_url_template: string | null;
          site_url: string;
          slug: string;
          updated_at: string;
        };
        Insert: {
          countries_blocked?: string[];
          created_at?: string;
          email_domains?: string[];
          has_referral?: never;
          id?: string;
          listed?: boolean;
          name: string;
          newsletter_only?: boolean;
          onboarding_notes?: string | null;
          referral_url_template?: string | null;
          site_url: string;
          slug: string;
          updated_at?: string;
        };
        Update: {
          countries_blocked?: string[];
          created_at?: string;
          email_domains?: string[];
          has_referral?: never;
          id?: string;
          listed?: boolean;
          name?: string;
          newsletter_only?: boolean;
          onboarding_notes?: string | null;
          referral_url_template?: string | null;
          site_url?: string;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      playbooks: {
        Row: {
          checklist: NonNullable<Json>;
          created_at: string;
          id: string;
          next_step: string;
          platform_id: string;
          stage: Database["public"]["Enums"]["card_stage"];
          updated_at: string;
        };
        Insert: {
          checklist?: NonNullable<Json>;
          created_at?: string;
          id?: string;
          next_step: string;
          platform_id: string;
          stage: Database["public"]["Enums"]["card_stage"];
          updated_at?: string;
        };
        Update: {
          checklist?: NonNullable<Json>;
          created_at?: string;
          id?: string;
          next_step?: string;
          platform_id?: string;
          stage?: Database["public"]["Enums"]["card_stage"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "playbooks_platform_id_fkey";
            columns: ["platform_id"];
            isOneToOne: false;
            referencedRelation: "platforms";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          country: string | null;
          created_at: string;
          display_name: string | null;
          domains: string[];
          hours_per_week: number | null;
          languages: string[];
          last_dashboard_at: string | null;
          locale: string;
          onboarded_at: string | null;
          previous_dashboard_at: string | null;
          skills: string[];
          target_rate: number | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          country?: string | null;
          created_at?: string;
          display_name?: string | null;
          domains?: string[];
          hours_per_week?: number | null;
          languages?: string[];
          last_dashboard_at?: string | null;
          locale?: string;
          onboarded_at?: string | null;
          previous_dashboard_at?: string | null;
          skills?: string[];
          target_rate?: number | null;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          country?: string | null;
          created_at?: string;
          display_name?: string | null;
          domains?: string[];
          hours_per_week?: number | null;
          languages?: string[];
          last_dashboard_at?: string | null;
          locale?: string;
          onboarded_at?: string | null;
          previous_dashboard_at?: string | null;
          skills?: string[];
          target_rate?: number | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      resume_generations: {
        Row: {
          company: string;
          error: string | null;
          finished_at: string | null;
          id: number;
          input_tokens: number | null;
          job_id: string;
          job_title: string;
          master_resume_id: string | null;
          model: string | null;
          ok: boolean | null;
          output_tokens: number | null;
          started_at: string;
          tailored_resume_id: string | null;
          user_id: string;
        };
        Insert: {
          company: string;
          error?: string | null;
          finished_at?: string | null;
          id?: number;
          input_tokens?: number | null;
          job_id: string;
          job_title: string;
          master_resume_id?: string | null;
          model?: string | null;
          ok?: boolean | null;
          output_tokens?: number | null;
          started_at?: string;
          tailored_resume_id?: string | null;
          user_id: string;
        };
        Update: {
          company?: string;
          error?: string | null;
          finished_at?: string | null;
          id?: number;
          input_tokens?: number | null;
          job_id?: string;
          job_title?: string;
          master_resume_id?: string | null;
          model?: string | null;
          ok?: boolean | null;
          output_tokens?: number | null;
          started_at?: string;
          tailored_resume_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "resume_generations_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "resume_generations_master_resume_id_fkey";
            columns: ["master_resume_id"];
            isOneToOne: false;
            referencedRelation: "master_resumes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "resume_generations_tailored_resume_id_fkey";
            columns: ["tailored_resume_id"];
            isOneToOne: false;
            referencedRelation: "tailored_resumes";
            referencedColumns: ["id"];
          },
        ];
      };
      saved_searches: {
        Row: {
          created_at: string;
          filters: NonNullable<Json>;
          frequency: Database["public"]["Enums"]["search_frequency"];
          id: string;
          last_sent_at: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          filters?: NonNullable<Json>;
          frequency?: Database["public"]["Enums"]["search_frequency"];
          id?: string;
          last_sent_at?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          filters?: NonNullable<Json>;
          frequency?: Database["public"]["Enums"]["search_frequency"];
          id?: string;
          last_sent_at?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      site_events: {
        Row: {
          at: string;
          event: string;
          id: number;
          source: string;
          utm_campaign: string | null;
          utm_medium: string | null;
          utm_source: string | null;
        };
        Insert: {
          at?: string;
          event: string;
          id?: never;
          source: string;
          utm_campaign?: string | null;
          utm_medium?: string | null;
          utm_source?: string | null;
        };
        Update: {
          at?: string;
          event?: string;
          id?: never;
          source?: string;
          utm_campaign?: string | null;
          utm_medium?: string | null;
          utm_source?: string | null;
        };
        Relationships: [];
      };
      tailored_resumes: {
        Row: {
          company: string;
          content: Json;
          created_at: string;
          id: string;
          job_id: string;
          job_title: string;
          master_resume_id: string | null;
          model: string | null;
          review: Json;
          saved_at: string | null;
          status: Database["public"]["Enums"]["tailored_resume_status"];
          updated_at: string;
          user_id: string;
          version: number;
        };
        Insert: {
          company: string;
          content: Json;
          created_at?: string;
          id?: string;
          job_id: string;
          job_title: string;
          master_resume_id?: string | null;
          model?: string | null;
          review?: Json;
          saved_at?: string | null;
          status?: Database["public"]["Enums"]["tailored_resume_status"];
          updated_at?: string;
          user_id: string;
          version: number;
        };
        Update: {
          company?: string;
          content?: Json;
          created_at?: string;
          id?: string;
          job_id?: string;
          job_title?: string;
          master_resume_id?: string | null;
          model?: string | null;
          review?: Json;
          saved_at?: string | null;
          status?: Database["public"]["Enums"]["tailored_resume_status"];
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "tailored_resumes_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tailored_resumes_master_resume_id_fkey";
            columns: ["master_resume_id"];
            isOneToOne: false;
            referencedRelation: "master_resumes";
            referencedColumns: ["id"];
          },
        ];
      };
      tracker_cards: {
        Row: {
          applied_at: string | null;
          created_at: string;
          id: string;
          job_id: string | null;
          kind: Database["public"]["Enums"]["card_kind"];
          next_action_at: string | null;
          notes: string | null;
          platform_id: string | null;
          position: number;
          stage: Database["public"]["Enums"]["card_stage"];
          tailored_resume_id: string | null;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          applied_at?: string | null;
          created_at?: string;
          id?: string;
          job_id?: string | null;
          kind: Database["public"]["Enums"]["card_kind"];
          next_action_at?: string | null;
          notes?: string | null;
          platform_id?: string | null;
          position?: number;
          stage?: Database["public"]["Enums"]["card_stage"];
          tailored_resume_id?: string | null;
          title: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          applied_at?: string | null;
          created_at?: string;
          id?: string;
          job_id?: string | null;
          kind?: Database["public"]["Enums"]["card_kind"];
          next_action_at?: string | null;
          notes?: string | null;
          platform_id?: string | null;
          position?: number;
          stage?: Database["public"]["Enums"]["card_stage"];
          tailored_resume_id?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tracker_cards_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tracker_cards_platform_id_fkey";
            columns: ["platform_id"];
            isOneToOne: false;
            referencedRelation: "platforms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tracker_cards_tailored_resume_id_fkey";
            columns: ["tailored_resume_id"];
            isOneToOne: false;
            referencedRelation: "tailored_resumes";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      admin_close_listing: { Args: { p_job_id: string }; Returns: boolean };
      admin_listing_candidates: {
        Args: { p_platform_id: string; p_url: string };
        Returns: {
          countries: string[];
          id: string;
          pay_max: number | null;
          pay_min: number | null;
          pay_unit: Database["public"]["Enums"]["pay_unit"] | null;
          platform_id: string;
          source: string;
          title: string;
          url: string;
        }[];
      };
      admin_listings: {
        Args: Record<PropertyKey, never>;
        Returns: {
          countries: string[];
          created_at: string;
          id: string;
          pay_max: number | null;
          pay_min: number | null;
          pay_unit: Database["public"]["Enums"]["pay_unit"] | null;
          platform_name: string;
          posted_at: string | null;
          review_of: string | null;
          review_title: string | null;
          review_url: string | null;
          status: Database["public"]["Enums"]["job_status"];
          title: string;
          url: string;
          verified_at: string | null;
        }[];
      };
      admin_signup_stats: {
        Args: Record<PropertyKey, never>;
        Returns: {
          last_30d: number;
          last_7d: number;
          source: string;
          utm_campaign: string | null;
          utm_source: string | null;
        }[];
      };
      admin_site_stats: { Args: Record<PropertyKey, never>; Returns: Json };
      admin_source_health: {
        Args: Record<PropertyKey, never>;
        Returns: {
          failures_in_row: number;
          last_error: string | null;
          last_found: number;
          last_started_at: string;
          name: string;
          newsletter_only: boolean;
          open_jobs: number;
          slug: string;
        }[];
      };
      admin_newsletter_cost: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      admin_newsletter_drafts: {
        Args: { p_run_id: string };
        Returns: {
          body: string;
          channel: string;
          emailed_at: string | null;
          id: string;
          post_error: string | null;
          post_url: string | null;
          posted_at: string | null;
          scheduled_for: string | null;
          status: string;
          title: string | null;
        }[];
      };
      admin_newsletter_runs: {
        Args: { p_limit?: number };
        Returns: {
          cost_usd: number;
          drafts: number;
          error: string | null;
          id: string;
          issue_date: string;
          kind: string;
          shortlisted: number;
          started_at: string;
          status: string;
          web_searches: number;
        }[];
      };
      admin_newsletter_shortlist: {
        Args: { p_run_id: string };
        Returns: {
          caveats: string | null;
          job_id: string;
          platform: string;
          rank: number;
          reason: string;
          title: string;
          url: string;
        }[];
      };
      admin_platforms: {
        Args: Record<PropertyKey, never>;
        Returns: { id: string; name: string; slug: string }[];
      };
      admin_resolve_listing: {
        Args: { p_job_id: string; p_keep: boolean };
        Returns: boolean;
      };
      admin_save_listing: {
        Args: {
          p_countries: string[];
          p_pay_max: number | null;
          p_pay_min: number | null;
          p_pay_unit: Database["public"]["Enums"]["pay_unit"] | null;
          p_platform_id: string | null;
          p_platform_name: string;
          p_posted_at: string | null;
          p_review_of?: string | null;
          p_summary: string;
          p_title: string;
          p_url: string;
          p_verified_at: string | null;
        };
        Returns: string;
      };
      admin_update_listing: {
        Args: {
          p_countries: string[];
          p_job_id: string;
          p_pay_max: number | null;
          p_pay_min: number | null;
          p_pay_unit: Database["public"]["Enums"]["pay_unit"] | null;
          p_posted_at: string | null;
          p_summary: string;
          p_title: string;
          p_url: string;
          p_verified_at: string | null;
        };
        Returns: boolean;
      };
      admin_users: {
        Args: { p_limit?: number; p_offset?: number; p_search?: string };
        Returns: {
          cards: number;
          created_at: string;
          email: string;
          last_sign_in_at: string | null;
          onboarded: boolean;
          total: number;
          user_id: string;
        }[];
      };
      claim_welcome_email: {
        Args: Record<PropertyKey, never>;
        Returns: {
          email: string;
          locale: string;
          unsubscribe_token: string;
        }[];
      };
      dashboard_visit: { Args: Record<PropertyKey, never>; Returns: string };
      due_job_alerts: {
        Args: { p_now: string; p_token: string };
        Returns: {
          email: string;
          filters: Json;
          frequency: Database["public"]["Enums"]["search_frequency"];
          jobs: Json;
          locale: string;
          platform_names: string[];
          search_id: string;
          total: number;
          unsubscribe_token: string;
          user_id: string;
        }[];
      };
      due_recaps: {
        Args: { p_day: string; p_token: string };
        Returns: {
          applied: number;
          email: string;
          locale: string;
          matches: Json;
          moves: number;
          responses: number;
          unsubscribe_token: string;
          user_id: string;
        }[];
      };
      due_reminders: {
        Args: { p_day: string; p_token: string };
        Returns: {
          cards: Json;
          email: string;
          locale: string;
          unsubscribe_token: string;
          user_id: string;
        }[];
      };
      email_prefs_by_token: {
        Args: { p_token: string };
        Returns: {
          alerts_on: boolean;
          recap_on: boolean;
          reminders_on: boolean;
        }[];
      };
      feed_facets: { Args: Record<PropertyKey, never>; Returns: Json };
      finish_resume_generation: {
        Args: {
          p_content: Json;
          p_error: string;
          p_generation_id: number;
          p_input_tokens: number;
          p_model: string;
          p_ok: boolean;
          p_output_tokens: number;
          p_review: Json;
        };
        Returns: string;
      };
      ingest_jobs: {
        Args: {
          p_error?: string;
          p_jobs: Json;
          p_platform: string;
          p_skipped?: number;
          p_started_at: string;
        };
        Returns: Json;
      };
      log_outbound_click: { Args: { p_job_id: string }; Returns: boolean };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      log_site_event: {
        Args: {
          p_event: string;
          p_source: string;
          p_utm_campaign?: string;
          p_utm_medium?: string;
          p_utm_source?: string;
        };
        Returns: undefined;
      };
      mark_job_alerts_sent: {
        Args: { p_at: string; p_search_ids: string[]; p_token: string };
        Returns: undefined;
      };
      mark_recap_sent: {
        Args: { p_day: string; p_token: string; p_user_id: string };
        Returns: undefined;
      };
      mark_reminder_sent: {
        Args: { p_day: string; p_token: string; p_user_id: string };
        Returns: undefined;
      };
      newsletter_mark_drafts_emailed: {
        Args: { p_ids: string[]; p_token: string };
        Returns: undefined;
      };
      newsletter_unsent_drafts: {
        Args: { p_run_id: string; p_token: string };
        Returns: {
          body: string;
          channel: string;
          id: string;
          issue_date: string;
          kind: string;
          scheduled_for: string | null;
          title: string | null;
        }[];
      };
      match_jobs: {
        Args: { p_job_ids?: string[]; p_limit?: number; p_user_id?: string };
        Returns: {
          country_ok: string;
          job_id: string;
          matched_domain: string;
          matched_languages: string[];
          pay_ok: boolean;
          score: number;
        }[];
      };
      record_inbound_email: {
        Args: {
          p_from: string;
          p_platform: string;
          p_stage: Database["public"]["Enums"]["card_stage"];
          p_subject: string;
          p_token: string;
        };
        Returns: string;
      };
      replace_master_resume: {
        Args: {
          p_content: string;
          p_file_name: string;
          p_file_size: number;
          p_file_type: string;
        };
        Returns: string;
      };
      resolve_inbound_email: {
        Args: {
          p_card_id?: string;
          p_email_id: string;
          p_stage: Database["public"]["Enums"]["card_stage"];
        };
        Returns: string;
      };
      resume_tailoring_usage: {
        Args: Record<PropertyKey, never>;
        Returns: { daily_limit: number; used: number }[];
      };
      save_master_profile: {
        Args: { p_content: string; p_evidence: string };
        Returns: string;
      };
      save_tailored_resume: {
        Args: { p_content: Json; p_final: boolean; p_id: string };
        Returns: undefined;
      };
      set_app_url: { Args: { p_url: string }; Returns: undefined };
      set_email_prefs_by_token: {
        Args: {
          p_alerts_on?: boolean;
          p_recap_on?: boolean;
          p_reminders_on?: boolean;
          p_token: string;
        };
        Returns: boolean;
      };
      set_ingest_url: { Args: { p_url: string }; Returns: undefined };
      start_resume_generation: {
        Args: { p_job_id: string };
        Returns: {
          company: string;
          generation_id: number;
          job_title: string;
          master_content: string;
          master_evidence: string;
          master_resume_id: string;
        }[];
      };
      verify_ingest_token: { Args: { p_token: string }; Returns: boolean };
    };
    Enums: {
      card_event_source: "user" | "email";
      card_kind: "job" | "platform" | "manual";
      card_stage:
        | "saved"
        | "applied"
        | "assessment"
        | "interviewing"
        | "offered"
        | "rejected";
      inbound_status: "applied" | "needs_review" | "ignored";
      job_status: "open" | "closed";
      membership_status:
        "not_joined" | "applied" | "interviewing" | "active" | "rejected";
      pay_unit:
        | "hour"
        | "day"
        | "week"
        | "month"
        | "year"
        | "task"
        | "session"
        | "project";
      search_frequency: "daily" | "weekly";
      tailored_resume_status: "draft" | "saved";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      card_event_source: ["user", "email"],
      card_kind: ["job", "platform", "manual"],
      card_stage: [
        "saved",
        "applied",
        "assessment",
        "interviewing",
        "offered",
        "rejected",
      ],
      inbound_status: ["applied", "needs_review", "ignored"],
      job_status: ["open", "closed"],
      membership_status: [
        "not_joined",
        "applied",
        "interviewing",
        "active",
        "rejected",
      ],
      pay_unit: [
        "hour",
        "day",
        "week",
        "month",
        "year",
        "task",
        "session",
        "project",
      ],
      search_frequency: ["daily", "weekly"],
      tailored_resume_status: ["draft", "saved"],
    },
  },
} as const;
