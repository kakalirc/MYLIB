import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { readAnthropicUsage, hasVerifiedAnthropicUsage } from "./usage_reconciliation.ts";

const response = JSON.stringify({
  id: "msg_saved_123",
  type: "message",
  usage: { input_tokens: 1_000_000, output_tokens: 200_000 },
  content: [{ type: "text", text: '{"items":[]}' }],
});

Deno.test("reconstructs exact USD usage from a saved provider response", () => {
  assertEquals(readAnthropicUsage(response, 1, 5), {
    providerRequestId: "msg_saved_123",
    inputTokens: 1_000_000,
    outputTokens: 200_000,
    inputCostUsd: 1,
    outputCostUsd: 1,
    totalCostUsd: 2,
  });
});

Deno.test("reconciliation is deterministic across repeated resumes", () => {
  const first = readAnthropicUsage(response, 1, 5);
  const resumed = readAnthropicUsage(response, 1, 5);
  assertEquals(resumed, first);
});

Deno.test("rejects saved responses without trustworthy token usage", () => {
  assertThrows(
    () => readAnthropicUsage(JSON.stringify({ id: "msg_no_usage", content: [] }), 1, 5),
    Error,
    "valid token usage",
  );
});

Deno.test("rejects provider error envelopes instead of inventing zero cost", () => {
  assertThrows(
    () => readAnthropicUsage(JSON.stringify({ error: { message: "rate limited" } }), 1, 5),
    Error,
    "rate limited",
  );
});


Deno.test("requires complete durable token and USD cost fields before another request", () => {
  assertEquals(hasVerifiedAnthropicUsage({ input_tokens: 10, output_tokens: 5, input_cost_usd: 0.00001, output_cost_usd: 0.000025, total_cost_usd: 0.000035 }), true);
  assertEquals(hasVerifiedAnthropicUsage({ input_tokens: 10, output_tokens: 5, input_cost_usd: 0.00001, output_cost_usd: 0.000025, total_cost_usd: null }), false);
  assertEquals(hasVerifiedAnthropicUsage({ input_tokens: 10, output_tokens: 5, total_cost_usd: 0.000035 }), false);
  assertEquals(hasVerifiedAnthropicUsage({ input_tokens: null, output_tokens: 5, input_cost_usd: 0, output_cost_usd: 0, total_cost_usd: 0 }), false);
});
