import { assertEquals } from "jsr:@std/assert@1";
import { matchesApprovedSourceDomain } from "./source-domain.ts";

Deno.test("accepts the www host of an enabled root domain", () => {
  assertEquals(matchesApprovedSourceDomain("www.cbse.gov.in", ["cbse.gov.in"]), true);
});

Deno.test("accepts a deeper subdomain of an enabled source", () => {
  assertEquals(matchesApprovedSourceDomain("academic.cbse.gov.in", ["cbse.gov.in"]), true);
});

Deno.test("accepts an enabled domain without www", () => {
  assertEquals(matchesApprovedSourceDomain("cbse.gov.in", ["www.cbse.gov.in"]), true);
});

Deno.test("rejects unrelated or malformed domains", () => {
  assertEquals(matchesApprovedSourceDomain("cbse.gov.in.attacker.example", ["cbse.gov.in"]), false);
  assertEquals(matchesApprovedSourceDomain("http://cbse.gov.in", ["cbse.gov.in"]), false);
  assertEquals(matchesApprovedSourceDomain("", ["cbse.gov.in"]), false);
});
