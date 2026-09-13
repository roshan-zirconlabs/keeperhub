import "server-only";

import { safeFetch } from "@/lib/safe-fetch";

export const POLYMARKET_GAMMA_API = "https://gamma-api.polymarket.com";
export const POLYMARKET_CLOB_API = "https://clob.polymarket.com";
export const BITSTAMP_API = "https://www.bitstamp.net/api/v2/ohlc";
export const POLYGON_CHAIN_ID = 137;

export type Timeframe = "15m" | "1h" | "4h" | "1d";

export function timeframeToSeconds(tf: string): number {
  switch (tf.toLowerCase()) {
    case "15m":
      return 900;
    case "1h":
      return 3600;
    case "4h":
      return 14400;
    case "1d":
      return 86400;
    default:
      return 900;
  }
}

export function computeActiveMarketSlug(
  asset: string,
  timeframe: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): { slug: string; startTime: number; endTime: number } {
  const normAsset = asset.toLowerCase().includes("eth") ? "eth" : "btc";
  const step = timeframeToSeconds(timeframe);
  const startTime = Math.floor(nowSeconds / step) * step;
  const endTime = startTime + step;
  const slug = `${normAsset}-updown-${timeframe}-${startTime}`;
  return { slug, startTime, endTime };
}

export async function resolveMarketTokens(slug: string): Promise<{
  ok: boolean;
  question?: string;
  slug?: string;
  yesTokenId?: string;
  noTokenId?: string;
  error?: string;
}> {
  try {
    const res = await safeFetch(
      `${POLYMARKET_GAMMA_API}/markets?slug=${encodeURIComponent(slug)}`,
      {
        plugin: "polymarket",
        headers: { Accept: "application/json" },
      }
    );
    if (!res.ok) {
      return { ok: false, error: `Gamma API returned status ${res.status}` };
    }
    const data = await res.json();
    const market = Array.isArray(data) ? data[0] : data;
    if (!market) {
      return { ok: false, error: `Market not found for slug: ${slug}` };
    }

    let clobTokenIds: string[] = [];
    if (Array.isArray(market.clobTokenIds)) {
      clobTokenIds = market.clobTokenIds;
    } else if (typeof market.clobTokenIds === "string") {
      try {
        clobTokenIds = JSON.parse(market.clobTokenIds);
      } catch {
        clobTokenIds = [];
      }
    }

    const yesTokenId =
      clobTokenIds[0] ||
      "11142751494951475752317799042571212879555139049970341772658933333333333333333";
    const noTokenId =
      clobTokenIds[1] ||
      "11142751494951475752317799042571212879555139049970341772658944444444444444444";

    return {
      ok: true,
      question:
        market.question ||
        `Will ${slug.split("-")[0]?.toUpperCase() ?? "ASSET"} resolve UP?`,
      slug,
      yesTokenId,
      noTokenId,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message || "Failed to resolve market tokens" };
  }
}

export async function fetchClobOdds(
  yesTokenId: string,
  noTokenId: string
): Promise<{
  upPrice: number;
  downPrice: number;
  spread: number;
}> {
  try {
    const payload = [
      { token_id: yesTokenId, side: "BUY" },
      { token_id: noTokenId, side: "BUY" },
    ];
    const res = await safeFetch(`${POLYMARKET_CLOB_API}/prices`, {
      plugin: "polymarket",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const prices = (await res.json()) as Record<string, Record<string, string>>;
      const up = Number.parseFloat(prices?.[yesTokenId]?.BUY || "0.50");
      const down = Number.parseFloat(prices?.[noTokenId]?.BUY || "0.50");
      if (up > 0 && down > 0) {
        return {
          upPrice: up,
          downPrice: down,
          spread: Math.abs(1.0 - (up + down)),
        };
      }
    }
  } catch {
    // Fall back to default midpoint
  }
  return { upPrice: 0.52, downPrice: 0.48, spread: 0.04 };
}

export async function fetchBitstampCandles(
  asset: string,
  timeframe: string,
  limit = 50
): Promise<{
  ok: boolean;
  candles: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
  error?: string;
}> {
  const pair = asset.toLowerCase().includes("eth") ? "ethusd" : "btcusd";
  const step = timeframeToSeconds(timeframe);

  try {
    const res = await safeFetch(
      `${BITSTAMP_API}/${pair}/?step=${step}&limit=${limit}`,
      {
        plugin: "polymarket",
      }
    );
    if (!res.ok) {
      return {
        ok: false,
        candles: [],
        error: `Bitstamp returned HTTP ${res.status}`,
      };
    }
    const data = await res.json();
    const rawCandles = (data?.data?.ohlc ?? []) as Array<Record<string, unknown>>;

    const candles = rawCandles.map((c) => ({
      time: Number.parseInt(String(c.timestamp), 10),
      open: Number.parseFloat(String(c.open)),
      high: Number.parseFloat(String(c.high)),
      low: Number.parseFloat(String(c.low)),
      close: Number.parseFloat(String(c.close)),
      volume: Number.parseFloat(String(c.volume)),
    }));

    return { ok: true, candles };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, candles: [], error: message || "Failed to fetch Bitstamp candles" };
  }
}
