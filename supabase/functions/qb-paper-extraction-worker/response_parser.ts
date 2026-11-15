import { jsonrepair } from "npm:jsonrepair@3.12.0";

export type ParsedQuestionResponse = { items: any[]; repaired: boolean };

export function parseQuestionItems(source: string): ParsedQuestionResponse {
  const text = source.trim().replace(/^\uFEFF/, "")
    .replace(/^\x60{3}(?:json)?\s*/i, "")
    .replace(/\s*\x60{3}$/, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("AI response did not contain a complete JSON object.");
  const candidate = text.slice(start, end + 1);
  let value: any;
  let repaired = false;
  try {
    value = JSON.parse(candidate);
  } catch (originalError) {
    try {
      value = JSON.parse(jsonrepair(candidate));
      repaired = true;
    } catch {
      const detail = originalError instanceof Error ? originalError.message : String(originalError);
      throw new Error("AI response JSON is malformed and could not be safely repaired: " + detail);
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value) || !Array.isArray(value.items)) {
    throw new Error("AI response schema invalid: expected an object containing an items array.");
  }
  const normalizedItems = value.items.map((sourceItem: any, index: number) => {
    if (!sourceItem || typeof sourceItem !== "object" || Array.isArray(sourceItem)) {
      throw new Error(`AI response schema invalid: item ${index + 1} is not an object.`);
    }
    if (!["question", "passage"].includes(sourceItem.item_kind)) {
      throw new Error(`AI response schema invalid: item ${index + 1} has an unsupported item_kind.`);
    }
    if (!Number.isInteger(Number(sourceItem.page_number))) {
      throw new Error(`AI response schema invalid: item ${index + 1} has no valid page_number.`);
    }
    const envelopeKeys = new Set(["item_kind", "page_number", "original_number", "parent_item_key", "payload"]);
    let payload = sourceItem.payload;
    if (payload == null) {
      // Models sometimes return the requested payload fields at item level.
      // Accept that equivalent shape and canonicalize it before staging.
      payload = Object.fromEntries(Object.entries(sourceItem).filter(([key]) => !envelopeKeys.has(key)));
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).length === 0) {
      throw new Error(`AI response schema invalid: item ${index + 1} has no usable question/passage content.`);
    }
    return { ...sourceItem, payload };
  });
  return { items: normalizedItems, repaired };
}
