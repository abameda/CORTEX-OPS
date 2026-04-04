import { StageOutput, Transcript, Workspace } from "@/types";
import { generateBrandPackagePrompt, generateGuidelinesPrompt } from "./stage3-brand";
import { generateStrategyPrompt } from "./stage2-strategy";
import { generateWebsitePrompt } from "./stage4-website";

function getCompletedOutput(
  previousOutputs: StageOutput[],
  stageNum: number,
  stageName?: string
) {
  return previousOutputs.find(
    (output) =>
      output.stage === stageNum &&
      output.status === "completed" &&
      (stageName ? output.stage_name === stageName : true)
  );
}

export async function generatePromptForStage(
  workspace: Workspace,
  stage: number,
  transcript: Transcript | null,
  previousOutputs: StageOutput[]
): Promise<{ prompt: string; subStage?: string }> {
  switch (stage) {
    case 1:
      return {
        prompt:
          "Stage 1 is the discovery transcript capture step. Use the transcript uploader to save notes or the ElevenLabs transcript before generating Stage 2.",
      };

    case 2: {
      if (!transcript) {
        throw new Error("No transcript found. Complete Stage 1 first.");
      }

      return {
        prompt: generateStrategyPrompt(workspace, transcript),
      };
    }

    case 3: {
      const strategy = getCompletedOutput(previousOutputs, 2);
      if (!strategy) {
        throw new Error("Stage 2 (Brand Strategy) must be completed first.");
      }

      const brandOutput = getCompletedOutput(previousOutputs, 3, "brand_system");
      if (!brandOutput) {
        return {
          prompt: generateBrandPackagePrompt(workspace, strategy),
          subStage: "brand_system",
        };
      }

      const guidelinesOutput = getCompletedOutput(previousOutputs, 3, "guidelines");
      if (!guidelinesOutput) {
        return {
          prompt: generateGuidelinesPrompt(workspace, strategy, brandOutput),
          subStage: "guidelines",
        };
      }

      return {
        prompt:
          "Stage 3 is complete. The brand system and guidelines are both saved. Proceed to the next unlocked stage.",
        subStage: "complete",
      };
    }

    case 4: {
      const strategy = getCompletedOutput(previousOutputs, 2);
      const brand = getCompletedOutput(previousOutputs, 3, "brand_system");
      if (!strategy || !brand) {
        throw new Error("Stages 2 and 3 must be completed first.");
      }

      return {
        prompt: generateWebsitePrompt(workspace, strategy, brand),
      };
    }

    case 5:
      return {
        prompt:
          "Stage 5 is a manual delivery step in v1. Package the completed assets and mark delivery in the next phase of the dashboard.",
      };

    case 6:
      return {
        prompt: `Generate a monthly social media content plan for ${workspace.business_name || workspace.client_name}.

Create 30 days of content across their priority platforms. For each post include:
- Platform (Instagram, Facebook, LinkedIn, Twitter/X)
- Post type (image, carousel, story, reel, text)
- Caption (in brand voice)
- Visual description (what the image/graphic should show)
- Hashtags (5-10 relevant)
- Best posting time
- Content pillar it belongs to

Also generate 3 ad creative concepts for Meta Ads:
- Headline
- Primary text
- Description
- Visual concept
- Target audience
- Suggested budget range

Use the brand voice and visual style established in the brand guidelines.`,
      };

    default:
      throw new Error(`Unknown stage: ${stage}`);
  }
}
