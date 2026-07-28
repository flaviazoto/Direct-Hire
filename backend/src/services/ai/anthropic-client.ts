// backend/src/services/ai/anthropic-client.ts
// Single shared Anthropic client — first AI-API integration in this
// backend. The key is read from process.env lazily, inside getAnthropicClient(),
// not at module-import time: this file gets imported as part of the normal
// processJob()/import graph (services/queue/index.ts), and the rest of the
// app must keep booting even if ANTHROPIC_API_KEY is unset — only the one
// feature that actually needs it (seo.generateJobMetadata) should fail, and
// only when it actually runs.

import Anthropic from "@anthropic-ai/sdk";

export const ANTHROPIC_MODEL = "claude-sonnet-4-6";
export const ANTHROPIC_MAX_TOKENS = 500;

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (client) return client;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — cannot use the Anthropic API. Set it in your environment (see .env.example).",
    );
  }

  client = new Anthropic({ apiKey });
  return client;
}
