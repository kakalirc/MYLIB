import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseJsonResponse } from "./json-response.ts";

Deno.test("parses a plain JSON array", () => {
  assertEquals(parseJsonResponse('[{"prompt":"Choose [A]","options":["{x}","b","c","d"]}]'), [
    { prompt: "Choose [A]", options: ["{x}", "b", "c", "d"] },
  ]);
});

Deno.test("parses fenced JSON with surrounding prose", () => {
  assertEquals(parseJsonResponse('Result follows:\n```json\n{"approved":true,"issues":[]}\n```\nThanks.'), {
    approved: true,
    issues: [],
  });
});

Deno.test("handles escaped quotes and braces inside JSON strings", () => {
  assertEquals(parseJsonResponse('prefix [{"prompt":"Say \\"hello\\" {world}"}] suffix'), [
    { prompt: 'Say "hello" {world}' },
  ]);
});

Deno.test("rejects truncated JSON", () => {
  assertThrows(() => parseJsonResponse('[{"prompt":"unfinished"}'), Error, "complete valid JSON");
});

Deno.test("rejects multiple JSON roots instead of silently selecting one", () => {
  assertThrows(() => parseJsonResponse('{"approved":true} {"approved":false}'), Error, "multiple JSON values");
});
