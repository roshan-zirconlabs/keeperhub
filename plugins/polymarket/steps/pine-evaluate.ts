import "server-only";

import {
  runPluginStep,
  type StepInput,
} from "@/lib/workflow/executor/step-handler";
import { fetchBitstampCandles } from "./polymarket-core";

export type PineEvaluateInput = StepInput & {
  asset: string;
  timeframe: string;
  script?: string;
  lookback?: number;
};

export type PineEvaluateResult =
  | {
      success: true;
      signal: "UP" | "DOWN" | "HOLD";
      confidence: number;
      latestClose: number;
      candlesEvaluated: number;
    }
  | {
      success: false;
      error: string;
    };

function calculateSimpleRsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) {
      avgGain = (avgGain * (period - 1) + diff) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) - diff) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

async function stepHandler(input: PineEvaluateInput): Promise<PineEvaluateResult> {
  const asset = input.asset || "BTC";
  const timeframe = input.timeframe || "15m";
  const lookback = input.lookback || 30;

  const candleRes = await fetchBitstampCandles(asset, timeframe, Math.max(lookback, 20));
  if (!candleRes.ok || candleRes.candles.length === 0) {
    return {
      success: false,
      error: candleRes.error || "Failed to fetch price candle data from Bitstamp",
    };
  }

  const candles = candleRes.candles;
  const closes = candles.map((c) => c.close);
  const latestClose = closes[closes.length - 1];
  const rsi = calculateSimpleRsi(closes, 14);

  let signal: "UP" | "DOWN" | "HOLD" = "HOLD";
  let confidence = 0.5;

  const customScript = (input.script || "").toLowerCase();

  if (customScript.includes("rsi < 30") || customScript.includes("oversold")) {
    if (rsi < 35) {
      signal = "UP";
      confidence = 0.85;
    } else {
      signal = "HOLD";
      confidence = 0.5;
    }
  } else if (customScript.includes("rsi > 70") || customScript.includes("overbought")) {
    if (rsi > 65) {
      signal = "DOWN";
      confidence = 0.85;
    } else {
      signal = "HOLD";
      confidence = 0.5;
    }
  } else {
    // Default momentum comparison
    const prevClose = closes[closes.length - 2] || latestClose;
    if (latestClose > prevClose) {
      signal = "UP";
      confidence = 0.72;
    } else if (latestClose < prevClose) {
      signal = "DOWN";
      confidence = 0.72;
    } else {
      signal = "HOLD";
      confidence = 0.5;
    }
  }

  return {
    success: true,
    signal,
    confidence,
    latestClose,
    candlesEvaluated: candles.length,
  };
}

export async function pineEvaluateStep(
  input: PineEvaluateInput
): Promise<PineEvaluateResult> {
  "use step";

  return runPluginStep(
    { pluginName: "polymarket", actionName: "pine-evaluate" },
    input,
    () => stepHandler(input)
  );
}

pineEvaluateStep.maxRetries = 0;

export const _integrationType = "polymarket";
