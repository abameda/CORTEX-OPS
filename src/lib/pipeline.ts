import { PIPELINE_STAGES, StageOutput, Tier } from "@/types";

export type StageUiStatus = "locked" | "pending" | "current" | "completed";

export const DEFAULT_STAGE_NAMES: Record<number, string> = {
  1: "discovery_call",
  2: "brand_strategy",
  3: "brand_system",
  4: "website_build",
  5: "delivery",
  6: "ongoing_management",
};

export function getDefaultStageName(stage: number): string {
  return DEFAULT_STAGE_NAMES[stage] || `stage_${stage}`;
}

export function getRelevantStages(tier: Tier) {
  return PIPELINE_STAGES.filter((stage) => stage.requiredTiers.includes(tier));
}

export function getNextRelevantStage(currentStage: number, tier: Tier): number | null {
  const relevantStages = getRelevantStages(tier);
  const currentIndex = relevantStages.findIndex((stage) => stage.number === currentStage);
  if (currentIndex === -1) {
    return null;
  }

  return relevantStages[currentIndex + 1]?.number ?? null;
}

export function getStageOutputs(outputs: StageOutput[], stage: number) {
  return outputs.filter((output) => output.stage === stage);
}

export function getCompletedStageOutput(
  outputs: StageOutput[],
  stage: number,
  stageName?: string
) {
  return outputs.find(
    (output) =>
      output.stage === stage &&
      output.status === "completed" &&
      (stageName ? output.stage_name === stageName : true)
  );
}

export function isStageThreeComplete(outputs: StageOutput[]) {
  return Boolean(getCompletedStageOutput(outputs, 3, "brand_system")) &&
    Boolean(getCompletedStageOutput(outputs, 3, "guidelines"));
}

export function getStageThreeCompletionSummary(outputs: StageOutput[]) {
  return {
    brandSystemDone: Boolean(getCompletedStageOutput(outputs, 3, "brand_system")),
    guidelinesDone: Boolean(getCompletedStageOutput(outputs, 3, "guidelines")),
  };
}

export function getStageUiStatus(
  stage: number,
  currentStage: number,
  outputs: StageOutput[]
): StageUiStatus {
  if (stage < currentStage) {
    return "completed";
  }

  if (stage > currentStage) {
    return "locked";
  }

  if (stage === 3 && isStageThreeComplete(outputs)) {
    return "completed";
  }

  const stageOutputs = getStageOutputs(outputs, stage);
  const hasCompletedOutput = stageOutputs.some((output) => output.status === "completed");

  if (hasCompletedOutput && stage !== currentStage) {
    return "completed";
  }

  return stageOutputs.length > 0 && stageOutputs.every((output) => output.status === "pending")
    ? "pending"
    : "current";
}
