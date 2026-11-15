import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { readAnthropicUsage } from "./usage_reconciliation.ts";

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
