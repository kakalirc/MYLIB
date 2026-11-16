import { assertEquals } from "jsr:@std/assert@1";
import { canonicalWebsiteScanDomain, matchesApprovedSourceDomain } from "./source-domain.ts";

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

Deno.test("canonicalises the AglaSem schools catalogue to its redirect host", () => {
  assertEquals(canonicalWebsiteScanDomain("schools.aglasem.com"), "aglasem.com");
  assertEquals(matchesApprovedSourceDomain("schools.aglasem.com", ["aglasem.com"]), true);
  assertEquals(matchesApprovedSourceDomain("aglasem.com", ["aglasem.com"]), true);
});


Deno.test("keeps AglaSem first-party redirect hosts in the canonical approved family", () => {
  for (const host of ["aglasem.com", "www.aglasem.com", "schools.aglasem.com", "docs.aglasem.com"]) {
    assertEquals(matchesApprovedSourceDomain(host, ["aglasem.com"]), true);
  }
  assertEquals(matchesApprovedSourceDomain("aglasem.com.attacker.example", ["aglasem.com"]), false);
  assertEquals(matchesApprovedSourceDomain("aglasem-downloads.example", ["aglasem.com"]), false);
});
