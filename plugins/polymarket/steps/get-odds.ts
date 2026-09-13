import "server-only";

import {
  runPluginStep,
  type StepInput,
} from "@/lib/workflow/executor/step-handler";
import {
  computeActiveMarketSlug,
  fetchClobOdds,
  resolveMarketTokens,
} from "./polymarket-core";

export type GetOddsInput = StepInput & {
  asset: string;
  timeframe: string;
};

export type GetOddsResult =
  | {
      success: true;
      slug: string;
      question: string;
      upPrice: number;
      downPrice: number;
      yesTokenId: string;
      noTokenId: string;
      startTime: number;
      endTime: number;
    }
  | {
      success: false;
      error: string;
    };

async function stepHandler(input: GetOddsInput): Promise<GetOddsResult> {
  const asset = input.asset || "BTC";
  const timeframe = input.timeframe || "15m";

  const { slug, startTime, endTime } = computeActiveMarketSlug(asset, timeframe);
  const resolved = await resolveMarketTokens(slug);

  if (!resolved.ok || !resolved.yesTokenId || !resolved.noTokenId) {
    return {
      success: false,
      error: resolved.error || `Unable to resolve Polymarket tokens for ${slug}`,
    };
  }

  const odds = await fetchClobOdds(resolved.yesTokenId, resolved.noTokenId);

  return {
    success: true,
    slug,
    question: resolved.question || `Will ${asset.toUpperCase()} resolve UP on ${timeframe}?`,
    upPrice: odds.upPrice,
    downPrice: odds.downPrice,
    yesTokenId: resolved.yesTokenId,
    noTokenId: resolved.noTokenId,
    startTime,
    endTime,
  };
}

export async function getOddsStep(input: GetOddsInput): Promise<GetOddsResult> {
  "use step";

  return runPluginStep(
    { pluginName: "polymarket", actionName: "get-odds" },
    input,
    () => stepHandler(input)
  );
}

getOddsStep.maxRetries = 0;

export const _integrationType = "polymarket";
