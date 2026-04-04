export type Tier = "launch" | "build" | "scale";
export type StageStatus = "pending" | "in_progress" | "completed" | "needs_review";
export type WorkspaceStatus = "active" | "completed" | "archived";
export type Currency = "EGP" | "USD";
export type ExecutionMode = "manual" | "api";

export interface Workspace {
  id: string;
  client_name: string;
  business_name: string | null;
  tier: Tier;
  status: WorkspaceStatus;
  current_stage: number;
  currency: Currency;
  created_at: string;
  updated_at: string;
}

export interface StageOutput {
  id: string;
  workspace_id: string;
  stage: number;
  stage_name: string;
  input_data: Record<string, unknown> | null;
  output_data: Record<string, unknown> | null;
  raw_output: string | null;
  prompt_used: string | null;
  status: StageStatus;
  completed_at: string | null;
  created_at: string;
}

export interface Transcript {
  id: string;
  workspace_id: string;
  raw_transcript: string;
  duration_seconds: number | null;
  language: string;
  extracted_data: Record<string, unknown> | null;
  created_at: string;
}

export interface Asset {
  id: string;
  workspace_id: string;
  stage: number;
  file_name: string;
  file_type: string;
  storage_path: string;
  created_at: string;
}

export interface StageDefinition {
  number: number;
  name: string;
  description: string;
  requiredTiers: Tier[];
  autoGenPrompt: boolean;
  requiresInput: string;
  produces: string;
}

export const PIPELINE_STAGES: StageDefinition[] = [
  {
    number: 1,
    name: "Discovery call",
    description: "ElevenLabs voice agent conducts discovery session",
    requiredTiers: ["launch", "build", "scale"],
    autoGenPrompt: false,
    requiresInput: "Cal.com booking",
    produces: "Call transcript",
  },
  {
    number: 2,
    name: "Brand strategy analysis",
    description: "Analyze transcript into a brand strategy document",
    requiredTiers: ["launch", "build", "scale"],
    autoGenPrompt: true,
    requiresInput: "Transcript from Stage 1",
    produces: "Brand strategy document",
  },
  {
    number: 3,
    name: "Brand package generation",
    description: "Logo, colors, typography, guidelines, and social media kit",
    requiredTiers: ["launch", "build", "scale"],
    autoGenPrompt: true,
    requiresInput: "Strategy from Stage 2",
    produces: "Complete brand package",
  },
  {
    number: 4,
    name: "Website build",
    description: "Generate a Claude Code prompt to build and deploy the site",
    requiredTiers: ["build", "scale"],
    autoGenPrompt: true,
    requiresInput: "Strategy and brand package from Stages 2 and 3",
    produces: "Live website on Vercel",
  },
  {
    number: 5,
    name: "Package and deliver",
    description: "Bundle assets and mark the client package as delivered",
    requiredTiers: ["launch", "build", "scale"],
    autoGenPrompt: false,
    requiresInput: "All completed stage outputs",
    produces: "Delivered brand package",
  },
  {
    number: 6,
    name: "Ongoing management",
    description: "Monthly content, ad support, and analytics reporting",
    requiredTiers: ["scale"],
    autoGenPrompt: true,
    requiresInput: "Completed brand package and live website",
    produces: "Monthly content and reports",
  },
];
