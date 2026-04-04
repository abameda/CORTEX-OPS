"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  getCompletedStageOutput,
  getRelevantStages,
  getStageThreeCompletionSummary,
  getStageUiStatus,
} from "@/lib/pipeline";
import { PIPELINE_STAGES, StageOutput, Workspace } from "@/types";
import DeliveryManager from "./DeliveryManager";
import OutputEditor from "./OutputEditor";
import PromptViewer from "./PromptViewer";
import StageRow from "./StageRow";
import TranscriptUploader from "./TranscriptUploader";

export default function PipelineView({
  workspace,
  stageOutputs,
  transcriptExists,
}: {
  workspace: Workspace;
  stageOutputs: StageOutput[];
  transcriptExists: boolean;
}) {
  const router = useRouter();
  const relevantStages = getRelevantStages(workspace.tier);
  const [activeStage, setActiveStage] = useState<number | null>(null);
  const [activeStageName, setActiveStageName] = useState<string | undefined>();
  const [prompt, setPrompt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, startGenerating] = useTransition();
  const [isSaving, startSaving] = useTransition();

  const stageThreeSummary = getStageThreeCompletionSummary(stageOutputs);
  const currentStageDefinition =
    PIPELINE_STAGES.find((stage) => stage.number === activeStage) ?? null;

  function refreshWorkspace() {
    router.refresh();
  }

  function getStageSummary(stageNumber: number) {
    if (stageNumber === 1) {
      return transcriptExists
        ? "Transcript saved. Stage 2 is unlocked."
        : "No transcript saved yet.";
    }

    if (stageNumber === 3) {
      return `Brand system: ${stageThreeSummary.brandSystemDone ? "done" : "pending"} | Guidelines: ${stageThreeSummary.guidelinesDone ? "done" : "pending"}`;
    }

    const completedOutput = getCompletedStageOutput(stageOutputs, stageNumber);
    return completedOutput ? `${completedOutput.stage_name.replaceAll("_", " ")} saved.` : undefined;
  }

  function handleGeneratePrompt(stageNumber: number) {
    setError(null);
    setActiveStage(stageNumber);
    startGenerating(async () => {
      try {
        const response = await fetch(`/api/workspace/${workspace.id}/prompt?stage=${stageNumber}`);
        const data = (await response.json()) as {
          error?: string;
          prompt?: string;
          subStage?: string;
        };

        if (!response.ok || !data.prompt) {
          throw new Error(data.error || "Failed to generate prompt.");
        }

        setActiveStageName(data.subStage && data.subStage !== "complete" ? data.subStage : undefined);
        setPrompt(data.prompt);
      } catch (generateError) {
        setActiveStage(null);
        setActiveStageName(undefined);
        setPrompt(null);
        setError(
          generateError instanceof Error ? generateError.message : "Failed to generate prompt."
        );
      }
    });
  }

  function handleSaveOutput(rawOutput: string) {
    if (!activeStage) {
      return;
    }

    setError(null);
    startSaving(async () => {
      try {
        const response = await fetch(`/api/workspace/${workspace.id}/output`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            stage: activeStage,
            stageName: activeStageName,
            rawOutput,
            promptUsed: prompt,
          }),
        });

        const data = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(data.error || "Failed to save output.");
        }

        setActiveStage(null);
        setActiveStageName(undefined);
        setPrompt(null);
        refreshWorkspace();
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : "Failed to save output.");
      }
    });
  }

  return (
    <div className="space-y-5">
      <TranscriptUploader
        workspaceId={workspace.id}
        disabled={workspace.status !== "active"}
        onUploaded={refreshWorkspace}
      />

      {relevantStages.map((stage) => {
        const status = getStageUiStatus(stage.number, workspace.current_stage, stageOutputs);
        const outputsForStage = stageOutputs.filter((output) => output.stage === stage.number);
        const displayOutput =
          stage.number === 3
            ? outputsForStage.find((output) => output.stage_name === "guidelines") ||
              outputsForStage.find((output) => output.stage_name === "brand_system") ||
              null
            : outputsForStage[0] || null;

        return (
          <StageRow
            key={stage.number}
            stage={stage}
            status={status}
            summary={getStageSummary(stage.number)}
            output={displayOutput}
            isActive={activeStage === stage.number}
            loading={isGenerating && activeStage === stage.number}
            actionSlot={
              stage.number === 5 ? (
                <DeliveryManager
                  workspaceId={workspace.id}
                  enabled={status !== "locked" && workspace.status === "active"}
                  alreadyDelivered={Boolean(getCompletedStageOutput(stageOutputs, 5))}
                  onDelivered={refreshWorkspace}
                />
              ) : undefined
            }
            onGeneratePrompt={
              stage.autoGenPrompt && workspace.status === "active"
                ? () => handleGeneratePrompt(stage.number)
                : undefined
            }
          />
        );
      })}

      {error ? (
        <div className="rounded-[1.5rem] border border-red-500/25 bg-red-500/10 px-5 py-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {activeStage && prompt ? (
        <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <PromptViewer prompt={prompt} />
          <OutputEditor
            onSave={handleSaveOutput}
            disabled={workspace.status !== "active"}
            saving={isSaving}
            stageLabel={currentStageDefinition?.name}
          />
        </div>
      ) : (
        <section className="rounded-[1.75rem] border border-dashed border-cortex-border bg-cortex-base/55 p-6">
          <p className="text-[11px] uppercase tracking-[0.22em] text-cortex-text-muted">
            Operator panel
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-cortex-text-secondary">
            Select an unlocked stage and generate a prompt to open the operator panel. Stage 6
            uses the same copy-paste-save flow as Stages 2 to 4.
          </p>
        </section>
      )}
    </div>
  );
}
