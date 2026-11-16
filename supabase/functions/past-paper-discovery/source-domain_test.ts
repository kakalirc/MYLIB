import { assertEquals } from "jsr:@std/assert@1";
import { canonicalWebsiteScanDomain, matchesApprovedSourceDomain, upgradeApprovedHttpRedirect } from "./source-domain.ts";

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


Deno.test("upgrades only approved default-port HTTP redirects to HTTPS", () => {
  const approved = upgradeApprovedHttpRedirect(new URL("http://aglasem.com/cbse-class-12-question-paper/"), ["aglasem.com"]);
  assertEquals(approved.href, "https://aglasem.com/cbse-class-12-question-paper/");
  const docs = upgradeApprovedHttpRedirect(new URL("http://docs.aglasem.com/view/123"), ["aglasem.com"]);
  assertEquals(docs.protocol, "https:");
  assertEquals(docs.hostname, "docs.aglasem.com");
  const unrelated = upgradeApprovedHttpRedirect(new URL("http://attacker.example/file"), ["aglasem.com"]);
  assertEquals(unrelated.protocol, "http:");
  const customPort = upgradeApprovedHttpRedirect(new URL("http://aglasem.com:8080/file"), ["aglasem.com"]);
  assertEquals(customPort.protocol, "http:");
});
