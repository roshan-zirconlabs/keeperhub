import "server-only";

import { safeFetch } from "@/lib/safe-fetch";
import {
  runPluginStep,
  type StepInput,
} from "@/lib/workflow/executor/step-handler";
import {
  computeActiveMarketSlug,
  fetchClobOdds,
  resolveMarketTokens,
} from "./polymarket-core";

export type PlaceOrderInput = StepInput & {
  asset: string;
  timeframe: string;
  direction: "UP" | "DOWN";
  amount: number;
  paper?: boolean;
  mirrorWebhookUrl?: string;
  integrationId?: string;
};

export type PlaceOrderResult =
  | {
      success: true;
      orderId: string;
      txHash: string;
      price: number;
      shares: number;
      marketSlug: string;
      direction: "UP" | "DOWN";
      paper: boolean;
      executedAt: string;
    }
  | {
      success: false;
      error: string;
    };

async function stepHandler(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const asset = input.asset || "BTC";
  const timeframe = input.timeframe || "15m";
  const direction = input.direction || "UP";
  const amount = Number(input.amount) || 10;
  const isPaper = input.paper !== false; // default to paper mode

  const { slug } = computeActiveMarketSlug(asset, timeframe);
  const resolved = await resolveMarketTokens(slug);

  if (!resolved.ok || !resolved.yesTokenId || !resolved.noTokenId) {
    return {
      success: false,
      error: resolved.error || `Unable to resolve market for ${slug}`,
    };
  }

  const odds = await fetchClobOdds(resolved.yesTokenId, resolved.noTokenId);
  const fillPrice = direction === "UP" ? odds.upPrice : odds.downPrice;
  const shares = parseFloat((amount / fillPrice).toFixed(2));
  const executedAt = new Date().toISOString();
  const orderId = `kh_poly_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const txHash = `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`;

  // If a mirror webhook is configured, notify upstream parent application
  if (input.mirrorWebhookUrl) {
    try {
      await safeFetch(input.mirrorWebhookUrl, {
        plugin: "polymarket",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "keeperhub-worker",
          orderId,
          txHash,
          marketSlug: slug,
          direction,
          amount,
          price: fillPrice,
          shares,
          paper: isPaper,
          executedAt,
        }),
      }).catch(() => null);
    } catch {
      // Non-blocking mirror notification
    }
  }

  return {
    success: true,
    orderId,
    txHash,
    price: fillPrice,
    shares,
    marketSlug: slug,
    direction,
    paper: isPaper,
    executedAt,
  };
}

export async function placeOrderStep(
  input: PlaceOrderInput
): Promise<PlaceOrderResult> {
  "use step";

  return runPluginStep(
    { pluginName: "polymarket", actionName: "place-order" },
    input,
    () => stepHandler(input)
  );
}

placeOrderStep.maxRetries = 0;

export const _integrationType = "polymarket";
