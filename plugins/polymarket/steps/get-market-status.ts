import "server-only";

import {
  runPluginStep,
  type StepInput,
} from "@/lib/workflow/executor/step-handler";
import {
  computeActiveMarketSlug,
  resolveMarketTokens,
} from "./polymarket-core";

export type GetMarketStatusInput = StepInput & {
  asset: string;
  timeframe: string;
};

export type GetMarketStatusResult =
  | {
      success: true;
      slug: string;
      question: string;
      yesTokenId: string;
      noTokenId: string;
      startTime: number;
      endTime: number;
    }
  | {
      success: false;
      error: string;
    };

async function stepHandler(
  input: GetMarketStatusInput
): Promise<GetMarketStatusResult> {
  const asset = input.asset || "BTC";
  const timeframe = input.timeframe || "15m";

  const { slug, startTime, endTime } = computeActiveMarketSlug(asset, timeframe);
  const resolved = await resolveMarketTokens(slug);

  if (!resolved.ok || !resolved.yesTokenId || !resolved.noTokenId) {
    return {
      success: false,
      error: resolved.error || `Unable to resolve market status for ${slug}`,
    };
  }

  return {
    success: true,
    slug,
    question: resolved.question || `Will ${asset.toUpperCase()} resolve UP on ${timeframe}?`,
    yesTokenId: resolved.yesTokenId,
    noTokenId: resolved.noTokenId,
    startTime,
    endTime,
  };
}

export async function getMarketStatusStep(
  input: GetMarketStatusInput
): Promise<GetMarketStatusResult> {
  "use step";

  return runPluginStep(
    { pluginName: "polymarket", actionName: "get-market-status" },
    input,
    () => stepHandler(input)
  );
}

getMarketStatusStep.maxRetries = 0;

export const _integrationType = "polymarket";
