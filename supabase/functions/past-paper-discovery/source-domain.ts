/** Domain-only matching for discovery candidates; URL fetching still uses safeHost. */
export function matchesApprovedSourceDomain(candidateDomain: unknown, enabledDomains: string[]): boolean {
  const host = String(candidateDomain ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (!host || host.includes("/") || host.includes("@") || host.includes(":") || /\s/.test(host)) return false;
  return enabledDomains.some((value) => {
    const domain = String(value ?? "").trim().toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
    const candidate = host.replace(/^www\./, "");
    return !!domain && (candidate === domain || candidate.endsWith("." + domain));
  });
}

/** True for the AglaSem first-party host family, including docs and CDN subdomains. */
export function isAglaSemDomain(hostname: string): boolean {
  const host = String(hostname || "").trim().toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  return host === "aglasem.com" || host.endsWith(".aglasem.com");
}

/** Identify AglaSem question-paper collection pages, not individual document pages. */
export function isAglaSemCollectionUrl(url: URL): boolean {
  if (!isAglaSemDomain(url.hostname)) return false;
  const path = url.pathname.toLowerCase();
  return path.includes("question-paper") || path.includes("sample-paper") || path.includes("/org/");
}

/** Canonicalise known catalogue aliases before applying same-site crawl restrictions. */
export function canonicalWebsiteScanDomain(hostname: string): string {
  const host = String(hostname || "").trim().toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  // AglaSem redirects its schools subdomain catalogue to the parent host.
  if (host === "schools.aglasem.com") return "aglasem.com";
  return host;
}


/**
 * Upgrade an approved first-party HTTP redirect to HTTPS before fetching it.
 * No HTTP request is ever made; non-approved hosts and non-default ports are
 * left unchanged so the caller's HTTPS/host validation rejects them.
 */
export function upgradeApprovedHttpRedirect(url: URL, enabledDomains: string[]): URL {
  const upgraded = new URL(url.href);
  if (upgraded.protocol !== "http:" || upgraded.username || upgraded.password ||
      (upgraded.port !== "" && upgraded.port !== "80") ||
      !matchesApprovedSourceDomain(upgraded.hostname, enabledDomains)) return upgraded;
  upgraded.protocol = "https:";
  upgraded.port = "";
  return upgraded;
}
