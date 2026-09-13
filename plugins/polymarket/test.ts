const POLYMARKET_GAMMA_API = "https://gamma-api.polymarket.com";

export async function testPolymarket(
  _credentials: Record<string, string>
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${POLYMARKET_GAMMA_API}/markets?limit=1`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Polymarket Gamma API returned HTTP ${response.status}`,
      };
    }

    return { success: true };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
