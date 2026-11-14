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
  for (let index = 0; index < value.items.length; index++) {
    const item = value.items[index];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`AI response schema invalid: item ${index + 1} is not an object.`);
    }
    if (!["question", "passage", "section", "instruction", "image"].includes(item.item_kind)) {
      throw new Error(`AI response schema invalid: item ${index + 1} has an unsupported item_kind.`);
    }
    if (!Number.isInteger(Number(item.page_number))) {
      throw new Error(`AI response schema invalid: item ${index + 1} has no valid page_number.`);
    }
    if (!item.payload || typeof item.payload !== "object" || Array.isArray(item.payload)) {
      throw new Error(`AI response schema invalid: item ${index + 1} has no payload object.`);
    }
  }
  return { items: value.items, repaired };
}
