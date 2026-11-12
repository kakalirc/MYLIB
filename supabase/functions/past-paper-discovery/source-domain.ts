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
