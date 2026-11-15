export type AnthropicUsage = {
  providerRequestId: string | null;
  inputTokens: number;
  outputTokens: number;
  inputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
};

const roundUsd = (value: number) => Math.round((value + Number.EPSILON) * 1e8) / 1e8;

/**
 * Reconstruct billing metadata from an immutable, durably stored Anthropic
 * response body. Safe to call repeatedly; it performs no I/O and no provider call.
 */
export function readAnthropicUsage(
  rawBody: string,
  inputUsdPerMillion: number,
  outputUsdPerMillion: number,
): AnthropicUsage {
  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    throw new Error("Saved Anthropic response is not valid JSON; usage cannot be reconciled.");
  }
  if (body?.error) {
    throw new Error(body.error.message || "Saved Anthropic response contains a provider error.");
  }

  const inputTokens = Number(body?.usage?.input_tokens);
  const outputTokens = Number(body?.usage?.output_tokens);
  if (!Number.isSafeInteger(inputTokens) || inputTokens < 0 ||
      !Number.isSafeInteger(outputTokens) || outputTokens < 0) {
    throw new Error("Saved Anthropic response does not contain valid token usage; no retry is safe.");
  }
  if (!Number.isFinite(inputUsdPerMillion) || inputUsdPerMillion < 0 ||
      !Number.isFinite(outputUsdPerMillion) || outputUsdPerMillion < 0) {
    throw new Error("A valid USD pricing snapshot is required to reconcile provider usage.");
  }

  const inputCostUsd = roundUsd(inputTokens * inputUsdPerMillion / 1_000_000);
  const outputCostUsd = roundUsd(outputTokens * outputUsdPerMillion / 1_000_000);
  return {
    providerRequestId: typeof body.id === "string" ? body.id : null,
    inputTokens,
    outputTokens,
    inputCostUsd,
    outputCostUsd,
    totalCostUsd: roundUsd(inputCostUsd + outputCostUsd),
  };
}
