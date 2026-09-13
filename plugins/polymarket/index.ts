import type { ActionConfigField, IntegrationPlugin } from "@/plugins/registry";
import { registerIntegration } from "@/plugins/registry-core";
import { PolymarketIcon } from "./icon";

const assetField = (): ActionConfigField => ({
  key: "asset",
  label: "Underlying Asset",
  type: "select",
  options: [
    { value: "BTC", label: "Bitcoin (BTC)" },
    { value: "ETH", label: "Ethereum (ETH)" },
  ],
  defaultValue: "BTC",
  placeholder: "Select asset",
  required: true,
});

const timeframeField = (): ActionConfigField => ({
  key: "timeframe",
  label: "Window Timeframe",
  type: "select",
  options: [
    { value: "15m", label: "15 Minutes" },
    { value: "1h", label: "1 Hour" },
    { value: "4h", label: "4 Hours" },
    { value: "1d", label: "1 Day (Daily)" },
  ],
  defaultValue: "15m",
  placeholder: "Select timeframe",
  required: true,
});

const polymarketPlugin: IntegrationPlugin = {
  type: "polymarket",
  egress: "fixed-host",
  label: "Polymarket",
  description:
    "Automated deterministic binary prediction markets on Polymarket with live CLOB odds, Gamma API v2 resolution, and Pine Script evaluation",

  icon: PolymarketIcon,

  requiresCredentials: false,
  singleConnection: false,
  formFields: [
    {
      id: "privateKey",
      label: "Polygon Wallet Private Key (Optional)",
      type: "password",
      placeholder: "0x... (Required only for live Polygon trading)",
      configKey: "privateKey",
      envVar: "POLYMARKET_PRIVATE_KEY",
      helpText:
        "Your Polygon EIP-712 execution wallet key. Leave empty for default paper trading mode.",
    },
    {
      id: "apiKey",
      label: "CLOB API Key (Optional)",
      type: "text",
      placeholder: "uuid...",
      configKey: "apiKey",
      envVar: "POLYMARKET_API_KEY",
      helpText: "Polymarket CLOB API Key for authenticated trading.",
    },
  ],

  testConfig: {
    getTestFunction: async () => {
      const { testPolymarket } = await import("./test");
      return testPolymarket;
    },
  },

  actions: [
    {
      slug: "get-odds",
      label: "Get Polymarket Odds",
      description:
        "Fetch live UP/DOWN market odds from Polymarket Gamma & CLOB API v2 for the active rolling window (15m, 1h, 4h, 1d)",
      category: "Polymarket",
      stepFunction: "getOddsStep",
      stepImportPath: "get-odds",
      configFields: [assetField(), timeframeField()],
      outputFields: [
        { field: "success", description: "Whether odds were successfully retrieved" },
        { field: "slug", description: "The active market slug (e.g. btc-updown-15m-1726272000)" },
        { field: "question", description: "The market proposition question" },
        { field: "upPrice", description: "Live UP/YES price (0.01 - 0.99 USDC)" },
        { field: "downPrice", description: "Live DOWN/NO price (0.01 - 0.99 USDC)" },
        { field: "yesTokenId", description: "Polymarket CLOB YES token ID" },
        { field: "noTokenId", description: "Polymarket CLOB NO token ID" },
        { field: "startTime", description: "Window start Unix epoch" },
        { field: "endTime", description: "Window end Unix epoch" },
        { field: "error", description: "Error message if failed" },
      ],
    },
    {
      slug: "pine-evaluate",
      label: "Evaluate Strategy Signal",
      description:
        "Evaluates public Bitstamp OHLC candle data using indicator conditions and outputs an actionable UP/DOWN/HOLD trade signal",
      category: "Polymarket",
      stepFunction: "pineEvaluateStep",
      stepImportPath: "pine-evaluate",
      configFields: [
        assetField(),
        timeframeField(),
        {
          key: "script",
          label: "Strategy Rules / Script",
          type: "template-textarea",
          placeholder:
            "Example: RSI < 30 on oversold bounce -> UP, RSI > 70 -> DOWN",
          rows: 3,
          example: "RSI < 30 -> UP",
          required: false,
        },
        {
          key: "lookback",
          label: "Candle Lookback",
          type: "template-input",
          placeholder: "30",
          defaultValue: "30",
          example: "30",
          required: false,
        },
      ],
      outputFields: [
        { field: "success", description: "Whether evaluation succeeded" },
        { field: "signal", description: "Computed trade signal (UP, DOWN, or HOLD)" },
        { field: "confidence", description: "Confidence score between 0.0 and 1.0" },
        { field: "latestClose", description: "Most recent close price of the underlying asset" },
        { field: "candlesEvaluated", description: "Number of historical candles evaluated" },
        { field: "error", description: "Error message if failed" },
      ],
    },
    {
      slug: "place-order",
      label: "Place Polymarket Order",
      description:
        "Executes a paper fill or live Polygon CLOB market order on the active binary market window and notifies upstream webhooks with the trade receipt",
      category: "Polymarket",
      stepFunction: "placeOrderStep",
      stepImportPath: "place-order",
      configFields: [
        assetField(),
        timeframeField(),
        {
          key: "direction",
          label: "Order Direction",
          type: "template-input",
          placeholder: "UP or DOWN or {{NodeName.signal}}",
          example: "{{PineEvaluate.signal}}",
          required: true,
        },
        {
          key: "amount",
          label: "Stake Amount (USDC)",
          type: "template-input",
          placeholder: "10.0",
          example: "25.0",
          required: true,
        },
        {
          key: "mirrorWebhookUrl",
          label: "Mirror Webhook URL",
          type: "template-input",
          placeholder: "https://your-app.vercel.app/api/ingest/trade",
          example: "https://zirconlabs.xyz/api/ingest/trade",
          required: false,
        },
      ],
      outputFields: [
        { field: "success", description: "Whether the order was executed" },
        { field: "orderId", description: "Unique execution order ID" },
        { field: "txHash", description: "Polygon transaction hash proof" },
        { field: "price", description: "Execution fill price" },
        { field: "shares", description: "Number of outcome shares purchased" },
        { field: "marketSlug", description: "Polymarket market slug" },
        { field: "direction", description: "Executed direction (UP or DOWN)" },
        { field: "paper", description: "Whether executed in paper simulation mode" },
        { field: "executedAt", description: "ISO timestamp of execution" },
        { field: "error", description: "Error message if failed" },
      ],
    },
    {
      slug: "get-market-status",
      label: "Get Market Status",
      description:
        "Resolves active rolling market slug and token IDs from Polymarket Gamma API v2",
      category: "Polymarket",
      stepFunction: "getMarketStatusStep",
      stepImportPath: "get-market-status",
      configFields: [assetField(), timeframeField()],
      outputFields: [
        { field: "success", description: "Whether status was retrieved" },
        { field: "slug", description: "Active market slug" },
        { field: "question", description: "Market proposition question" },
        { field: "yesTokenId", description: "YES token ID" },
        { field: "noTokenId", description: "NO token ID" },
        { field: "startTime", description: "Window start timestamp" },
        { field: "endTime", description: "Window end timestamp" },
        { field: "error", description: "Error message if failed" },
      ],
    },
  ],
};

// Auto-register on import
registerIntegration(polymarketPlugin);

export default polymarketPlugin;
