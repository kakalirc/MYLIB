import { parseJsonResponse } from "./json-response.ts";

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("Values differ: " + JSON.stringify(actual) + " !== " + JSON.stringify(expected));
  }
}

function assertThrows(run: () => unknown, message: string) {
  try {
    run();
  } catch (error) {
    if (String((error as Error).message).includes(message)) return;
    throw error;
  }
  throw new Error("Expected function to throw: " + message);
}

Deno.test("parses a plain JSON array with nested objects and brackets", () => {
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
  assertThrows(() => parseJsonResponse('[{"prompt":"unfinished"}'), "complete valid JSON");
});

Deno.test("rejects multiple JSON roots instead of silently selecting one", () => {
  assertThrows(() => parseJsonResponse('{"approved":true} {"approved":false}'), "multiple JSON values");
});
