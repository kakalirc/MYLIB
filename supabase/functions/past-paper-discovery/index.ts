// Admin-only online Past Paper discovery.
// Pre-Search is PDF-only; newly discovered direct-PDF domains receive candidate-scoped verification,
// while permanent source-registry changes remain explicit Admin actions. Imports use the existing workflow.
import { createClient } from "npm:@supabase/supabase-js@2";
import { getPdfZipMember, listPdfMembersFromZip } from "./archive.ts";
import { canonicalWebsiteScanDomain, isAglaSemCollectionUrl, isAglaSemDomain, matchesApprovedSourceDomain } from "./source-domain.ts";
import {
  buildPdfQueryVariants, filterBoardSourcesForQuery, isPrivateAddress, isQuestionPaperPdf,
  isValidDiscoveredDomain, matchesQuery, queryTerms,
} from "./presearch.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const MAX_PDF_BYTES = 50 * 1024 * 1024;
const MAX_DISCOVERED_CANDIDATES_PER_BATCH = 300;
const uuid = (v: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v ?? ""));

function safeHost(url: URL, domains: string[]): boolean {
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")
      || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return false;
  return domains.some((d) => host === d || host.endsWith("." + d));
}
async function assertPublicDns(host: string): Promise<void> {
  const addresses: string[] = [];
  try { addresses.push(...await Deno.resolveDns(host, "A")); } catch { /* Try AAAA. */ }
  try { addresses.push(...await Deno.resolveDns(host, "AAAA")); } catch { /* No AAAA record is normal. */ }
  if (!addresses.length) throw new Error("Source hostname did not resolve to a public IP address.");
  if (addresses.some(isPrivateAddress)) throw new Error("Source hostname resolves to a private or reserved IP address.");
}
function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
function htmlText(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ")).trim();
}
function ddgTarget(href: string): string {
  try {
    const u = new URL(decodeEntities(href), "https://html.duckduckgo.com");
    const target = u.searchParams.get("uddg");
    return target || u.href;
  } catch { return ""; }
}
function parseSearchResults(html: string, limit: number) {
  const rows: Array<{ title: string; url: string; snippet: string; domain: string }> = [];
  const anchors = html.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) || [];
  for (const anchor of anchors) {
    if (rows.length >= limit) break;
    const className = anchor.match(/\bclass\s*=\s*["']([^"']*)["']/i)?.[1] || "";
    if (!/(^|\s)result__a(\s|$)/i.test(className)) continue;
    const href = anchor.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1] || "";
    const target = ddgTarget(href);
    if (!target) continue;
    let parsed: URL;
    try { parsed = new URL(target); } catch { continue; }
    if (parsed.protocol !== "https:" || !parsed.hostname || parsed.hostname === "html.duckduckgo.com") continue;
    const title = htmlText(anchor.replace(/^<a\b[^>]*>/i, "").replace(/<\/a>$/i, ""));
    const tail = html.slice(html.indexOf(anchor) + anchor.length, html.indexOf(anchor) + anchor.length + 1800);
    const snippetMatch = tail.match(/class\s*=\s*["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i);
    rows.push({
      title: title.slice(0, 500) || parsed.pathname.split("/").pop() || parsed.hostname,
      url: parsed.href,
      snippet: snippetMatch ? htmlText(snippetMatch[1]).slice(0, 1200) : "",
      domain: parsed.hostname.toLowerCase().replace(/^www\./, ""),
    });
  }
  if (!rows.length) {
    const lower = html.toLowerCase();
    const challenge = /anomaly-modal|captcha|bot detection|automated queries|unusual traffic|challenge-form|cf-chl-|verify you are human/.test(lower);
    if (challenge) throw new Error("Search provider returned a bot-check or challenge page.");
    const explicitEmpty = /no results found|no results for|class=["'][^"']*no-results|result--no-results/.test(lower);
    if (!explicitEmpty) throw new Error("Search provider returned an unrecognized page; zero results cannot be trusted.");
  }
  return rows;
}
async function searchBingRss(query: string, limit = 20, domain?: string, offset = 0) {
  const targeted = domain ? query + " site:" + domain : query;
  const res = await fetch("https://www.bing.com/search?format=rss&first=" + (offset + 1) + "&q=" + encodeURIComponent(targeted), {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; LIBEducationPastPaperDiscovery/1.0)",
      "Accept": "application/rss+xml, application/xml, text/xml",
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error("Bing RSS returned HTTP " + res.status + ".");
  const xml = new TextDecoder().decode(await readBounded(res, 2 * 1024 * 1024));
  if (!/<(?:rss|rdf:RDF)\b/i.test(xml) || !/<channel\b|<item\b/i.test(xml)) {
    throw new Error("Bing RSS returned HTTP 200 but the response was not a recognizable RSS feed.");
  }
  const rows: Array<{ title: string; url: string; snippet: string; domain: string }> = [];
  const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  for (const item of items) {
    if (rows.length >= limit) break;
    const tag = (name: string) => {
      const match = item.match(new RegExp("<" + name + "[^>]*>([\\s\\S]*?)</" + name + ">", "i"));
      return match ? decodeEntities(match[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim()) : "";
    };
    const rawUrl = tag("link");
    let target: URL;
    try { target = new URL(rawUrl); } catch { continue; }
    if (target.protocol !== "https:" && target.protocol !== "http:") continue;
    const host = target.hostname.toLowerCase().replace(/^www\./, "");
    if (domain && host !== domain && !host.endsWith("." + domain)) continue;
    rows.push({ title: htmlText(tag("title")).slice(0, 500) || target.hostname,
      url: target.href, snippet: "Bing RSS search · " + htmlText(tag("description")).slice(0, 1000), domain: host });
  }
  return rows;
}
async function searchGoogleSerper(query: string, limit = 20, domain?: string, offset = 0) {
  const apiKey = Deno.env.get("SERPER_API_KEY")?.trim();
  if (!apiKey) throw new Error("SERPER_API_KEY is not configured in Supabase Edge Function secrets.");
  const targeted = domain ? query + " site:" + domain : query;
  const page = Math.floor(offset / 10) + 1;
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ q: targeted, num: Math.min(10, Math.max(1, limit)), page }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error("Google Search (Serper) returned HTTP " + res.status + ".");
  const payload = await res.json().catch(() => null);
  if (!payload || typeof payload !== "object" ||
      (!Array.isArray((payload as any).organic) && !(payload as any).searchParameters)) {
    throw new Error("Google Search (Serper) returned an unrecognized response; zero results cannot be trusted.");
  }
  const organic = Array.isArray((payload as any).organic) ? (payload as any).organic : [];
  return organic.slice(0, limit).flatMap((item: any) => {
    let target: URL;
    try { target = new URL(String(item.link || "")); } catch { return []; }
    if (target.protocol !== "https:" || !target.hostname) return [];
    const host = target.hostname.toLowerCase().replace(/^www\./, "");
    if (domain && host !== domain && !host.endsWith("." + domain)) return [];
    return [{
      title: clip(item.title || target.pathname.split("/").pop() || host, 500),
      url: target.href,
      snippet: clip(item.snippet || "", 1200),
      domain: host,
    }];
  });
}
type SearchWebResult = {
  rows: Array<{ title: string; url: string; snippet: string; domain: string }>;
  providersSucceeded: string[];
  providerErrors: string[];
};
async function searchDuckDuckGo(query: string, limit = 20, domain?: string, offset = 0) {
  const targeted = domain ? query + " site:" + domain : query;
  const res = await fetch("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(targeted) + "&s=" + offset, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error("DuckDuckGo returned HTTP " + res.status + ".");
  const html = new TextDecoder().decode(await readBounded(res, 2 * 1024 * 1024));
  return parseSearchResults(html, limit).filter((row) => !domain || row.domain === domain || row.domain.endsWith("." + domain));
}
async function searchWeb(query: string, limit = 20, domain?: string, offset = 0): Promise<SearchWebResult> {
  // Run independent providers for every query. A partial result from one provider
  // must not suppress the second provider's search or hide its failure diagnostics.
  const attempts = await Promise.all([
    Promise.resolve().then(async () => ({ provider: "DuckDuckGo HTML", rows: await searchDuckDuckGo(query, limit, domain, offset), error: "" }))
      .catch((error) => ({ provider: "DuckDuckGo HTML", rows: [] as any[], error: clip((error as Error)?.message || error, 220) })),
    Promise.resolve().then(async () => ({ provider: "Bing RSS", rows: await searchBingRss(query, limit, domain, offset), error: "" }))
      .catch((error) => ({ provider: "Bing RSS", rows: [] as any[], error: clip((error as Error)?.message || error, 220) })),
    Promise.resolve().then(async () => ({ provider: "Google Search (Serper)", rows: await searchGoogleSerper(query, limit, domain, offset), error: "" }))
      .catch((error) => ({ provider: "Google Search (Serper)", rows: [] as any[], error: clip((error as Error)?.message || error, 220) })),
  ]);
  const providersSucceeded = attempts.filter((item) => !item.error).map((item) => item.provider);
  const providerErrors = attempts.filter((item) => !!item.error).map((item) => item.provider + ": " + item.error);
  if (!providersSucceeded.length) {
    throw new Error(providerErrors.join(" · ") || "All search providers failed.");
  }
  const unique = new Map<string, any>();
  for (const item of attempts) for (const row of item.rows) {
    const key = String(row.url || "").toLowerCase();
    if (key && !unique.has(key)) unique.set(key, row);
  }
  return { rows: [...unique.values()].slice(0, limit), providersSucceeded, providerErrors };
}
async function searchInBatches(sources: any[], query: string, batchSize = 4) {
  const results: Array<{ title: string; url: string; snippet: string; domain: string; source: any; archive_member?: string; pdf_search_hint?: boolean }> = [];
  const errors: string[] = [];
  let successfulQueries = 0;
  for (let i = 0; i < sources.length; i += batchSize) {
    const batch = sources.slice(i, i + batchSize);
    const settled = await Promise.all(batch.map(async (source: any) => {
      try {
        const variants = buildPdfQueryVariants(query);
        const attempts = await Promise.all(variants.flatMap((variant) => [0, 30].map(async (offset) => {
          try {
            const result = await searchWeb(variant, 8, source.domain, offset);
            return { rows: result.rows, successfulQueries: result.providersSucceeded.length,
              error: result.providerErrors.join(" · ") };
          } catch (e) { return { rows: [], successfulQueries: 0, error: clip((e as Error)?.message || e, 300) }; }
        })));
        const successful = attempts.filter((x) => x.successfulQueries > 0);
        const failed = attempts.filter((x) => x.successfulQueries === 0);
        if (!successful.length) throw new Error(failed.map((x) => x.error).join(" · "));
        const partial = attempts.filter((x) => x.error && x.successfulQueries > 0);
        return { source, rows: successful.flatMap((x) => x.rows),
          successfulQueries: successful.reduce((sum, x) => sum + x.successfulQueries, 0),
          error: [...failed, ...partial].length ? source.domain + ": " + [...failed, ...partial].map((x) => x.error).join(" · ") : "" };
      } catch (e) {
        return { source, rows: [], error: source.domain + ": " + clip((e as Error)?.message || e, 220) };
      }
    }));
    for (const item of settled) {
      if (item.error) errors.push(item.error);
      successfulQueries += Number((item as any).successfulQueries || (!item.error ? 1 : 0));
      for (const row of item.rows) results.push({ ...row, source: item.source, pdf_search_hint: true });
    }
  }
  return { results, errors, successfulQueries };
}
async function fetchAllowed(urlText: string, domains: string[], accept: string) {
  let url: URL;
  try { url = new URL(urlText); } catch { throw new Error("Invalid URL."); }
  for (let hop = 0; hop <= 5; hop++) {
    if (!safeHost(url, domains)) throw new Error("URL or redirect is outside the approved source domains.");
    await assertPublicDns(url.hostname);
    const res = await fetch(url.href, {
      redirect: "manual",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LIBEducationPastPaperDiscovery/1.0)", Accept: accept },
      signal: AbortSignal.timeout(25000),
    });
    if ([301,302,303,307,308].includes(res.status)) {
      const location = res.headers.get("location");
      if (!location) throw new Error("Source returned an invalid redirect.");
      url = new URL(location, url);
      continue;
    }
    if (!res.ok) throw new Error("Source returned HTTP " + res.status + ".");
    return { response: res, url: url.href };
  }
  throw new Error("Too many redirects.");
}
type DiscoveryRow = {title:string;url:string;snippet:string;domain:string;source:any;archive_member?:string;pdf_search_hint?:boolean};
function websiteUrlRelevance(url: URL, criteria: string): number {
  const value = (url.pathname + " " + url.search).toLowerCase().replace(/[^a-z0-9]+/g, " ");
  const terms = queryTerms(criteria);
  const paper = /question paper|previous year|past paper|sample paper|specimen|exam paper|paper archive|qp\\b/.test(value);
  const subjectMatches = !terms.length || terms.some((term) => value.includes(term));
  const classMatch = criteria.match(/\b(class|grade)\s*(10|12|xii|x)\b/i);
  const classMatches = !classMatch || new RegExp("(?:class|grade|std|standard)[-_/ ]*(?:" + (classMatch[2].toLowerCase() === "12" || classMatch[2].toLowerCase() === "xii" ? "12|xii" : "10|x") + ")(?:\\b|/|$)", "i").test(value);
  if (subjectMatches && paper && classMatches) return 100;
  if (paper && subjectMatches) return 70;
  if (paper && classMatches) return 45;
  if (/archive|question|paper|exam|download|resource/.test(value)) return 20;
  return 0;
}
function extractDocumentTargets(html: string, baseUrl: string): string[] {
  const found = new Set<string>();
  const add = (raw: string) => {
    try {
      const value = decodeEntities(raw).replace(/\\u0026/gi, "&").replace(/\\\//g, "/");
      const url = new URL(value, baseUrl);
      if (url.protocol === "https:" && /(?:\.pdf(?:$|[?#])|single-doc-download|download|pdf|document)/i.test(url.href)) found.add(url.href);
    } catch { /* Ignore non-URL fragments. */ }
  };
  for (const match of html.matchAll(/<(?:iframe|embed|object)\b[^>]*(?:src|data)\s*=\s*["']([^"']+)["'][^>]*>/gi)) add(match[1]);
  for (const match of html.matchAll(/(?:href|src|data-url|data-src|data-download-url)\s*=\s*["']([^"']+)["']/gi)) add(match[1]);
  for (const match of html.matchAll(/https?:\\?[^"'\\s<>]*(?:pdf|download|single-doc-download)[^"'\\s<>]*/gi)) add(match[0]);
  return [...found];
}
function canonicalScanUrl(url: URL, rootHost: string): URL {
  const copy = new URL(url.href);
  const canonical = canonicalWebsiteScanDomain(copy.hostname);
  if (canonical === rootHost || copy.hostname === rootHost) copy.hostname = rootHost;
  return copy;
}
function linkRows(html: string, baseUrl: string, source: any, terms: string[], limit = 60): DiscoveryRow[] {
  const rows: DiscoveryRow[] = [];
  const anchors = html.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) || [];
  for (const anchor of anchors) {
    if (rows.length >= limit) break;
    const href = anchor.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1] || "";
    if (!href) continue;
    const label = htmlText(anchor.replace(/^<a\b[^>]*>/i, "").replace(/<\/a>$/i, ""));
    const anchorAt = html.indexOf(anchor);
    const rowStart = html.lastIndexOf("<tr", anchorAt);
    const rowEnd = html.indexOf("</tr>", anchorAt);
    const context = rowStart >= 0 && rowEnd > anchorAt ? htmlText(html.slice(rowStart, rowEnd + 5)) : "";
    let target: URL;
    try { target = new URL(decodeEntities(href), baseUrl); } catch { continue; }
    if (!safeHost(target, [source.domain])) continue;
    const isPdf = /\.pdf(?:$|[?#])/i.test(target.href);
    const downloadHint = /download|pdf/i.test(anchor) || /\/(?:download|file|attachment|pdf)(?:\/|$)/i.test(target.pathname);
    const evidence = label + " " + context + " " + target.pathname;
    if (!matchesQuery(evidence, terms)) continue;
    const paperSignal = /question[-_ ]paper|previous[-_ ]year|past[-_ ]paper|sample[-_ ]paper|specimen[-_ ]paper|exam[-_ ]paper|\bqp\b/i.test(evidence);
    if (!isPdf && !(downloadHint && paperSignal)) continue;
    rows.push({ title: (label || context || target.pathname.split("/").pop() || source.display_name).slice(0, 500),
      url: target.href, snippet: "Official source page · " + source.display_name + (context ? " · " + context.slice(0, 500) : ""),
              domain: target.hostname.toLowerCase().replace(/^www\./, ""),
  }
  return rows;
}
async function crawlCbseOfficial(source: any, query: string): Promise<DiscoveryRow[]> {
  const terms = queryTerms(query);
  const rows: DiscoveryRow[] = [];
  if (source.domain === "cbse.gov.in") {
    const landing = "https://www.cbse.gov.in/cbsenew/question-paper.html";
    const { response, url } = await fetchAllowed(landing, [source.domain], "text/html,application/xhtml+xml");
    const html = new TextDecoder().decode(await readBounded(response, 2 * 1024 * 1024));
    const tableRows = html.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
    let offset = 0;
    for (const row of tableRows) {
      const position = html.indexOf(row, offset); offset = position + row.length;
      const before = html.slice(Math.max(0, position - 12000), position);
      const headings = [...before.matchAll(/Question Paper for\s*([^<\n]{0,180})/gi)];
      const section = headings.length ? htmlText(headings[headings.length - 1][1]) : "";
      const classMatch = section.match(/class\s*(xii|x|12|10)/i);
      const wantedClass = /\b(12|xii)\b/i.test(query) ? "xii" : /\b(10|x)\b/i.test(query) ? "x" : "";
      const actualClass = classMatch ? (/xii|12/i.test(classMatch[1]) ? "xii" : "x") : "";
      if (wantedClass && actualClass && wantedClass !== actualClass) continue;
      const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)];
      if (cells.length < 2) continue;
      const subject = htmlText(cells[0][1]).toUpperCase();
      if (!subject || /SUBJECT NAME|TOTAL/i.test(subject) || !matchesQuery(subject, terms)) continue;
      const links = [...cells[1][1].matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
      for (const link of links) {
        let target: URL; try { target = new URL(decodeEntities(link[1]), url); } catch { continue; }
        if (!safeHost(target, [source.domain]) || !/\.pdf(?:$|[?#])/i.test(target.href)) continue;
        rows.push({ title: [section, subject].filter(Boolean).join(" — "), url: target.href,
          snippet: "Official CBSE previous-year paper · " + subject, domain: target.hostname.toLowerCase(), source });
      }
    }
  } else {
    // CBSE Academic publishes year-specific pages and maintains an archive index.
    // The old unversioned SQP_CLASSX.html / SQP_CLASSXII.html paths return 404.
    const archiveUrl = "https://cbseacademic.nic.in/sqp_archive.html";
    const archive = await fetchAllowed(archiveUrl, [source.domain], "text/html,application/xhtml+xml");
    const archiveHtml = new TextDecoder().decode(await readBounded(archive.response, 2 * 1024 * 1024));
    const wantedClasses = /\b(12|xii)\b/i.test(query) ? ["XII"]
      : /\b(10|x)\b/i.test(query) ? ["X"] : ["X", "XII"];
    const archiveLinks = [...archiveHtml.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
    for (const cls of wantedClasses) {
      const classPattern = new RegExp("SQP_CLASS" + cls + "_(\\d{4}-\\d{2})\.html", "i");
      const pages = archiveLinks.map((m) => {
        let href = ""; try { href = new URL(decodeEntities(m[1]), archive.url).href; } catch { return null; }
        const match = new URL(href).pathname.match(classPattern);
        return match ? { url: href, year: match[1] } : null;
      }).filter((x): x is {url:string;year:string} => !!x)
        .sort((a, b) => b.year.localeCompare(a.year)).slice(0, 5);
      // If the archive index markup changes, try the currently published session pages.
      if (!pages.length) {
        for (const year of ["2026-27", "2025-26", "2024-25"]) {
          pages.push({ url: "https://cbseacademic.nic.in/SQP_CLASS" + cls + "_" + year + ".html", year });
        }
      }
      for (const page of pages) {
        try {
          const pageRes = await fetchAllowed(page.url, [source.domain], "text/html,application/xhtml+xml");
          const pageHtml = new TextDecoder().decode(await readBounded(pageRes.response, 2 * 1024 * 1024));
          const tableRows = pageHtml.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
          for (const row of tableRows) {
            const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)];
            if (cells.length < 2) continue;
            const subject = htmlText(cells[0][1]);
            if (!subject || /subject/i.test(subject) || !matchesQuery(subject, terms)) continue;
            // Column two contains the sample paper; the next column is the marking scheme.
            for (const link of cells[1][1].matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
              let target: URL; try { target = new URL(decodeEntities(link[1]), pageRes.url); } catch { continue; }
              if (!safeHost(target, [source.domain]) || !/\.pdf(?:$|[?#])/i.test(target.href)) continue;
              let markingSchemeUrl = "";
              if (cells.length >= 3) {
                const msLink = cells[2][1].match(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/i)?.[1];
                if (msLink) {
                  try {
                    const msTarget = new URL(decodeEntities(msLink), pageRes.url);
                    if (safeHost(msTarget, [source.domain]) && /\.pdf(?:$|[?#])/i.test(msTarget.href)) markingSchemeUrl = msTarget.href;
                  } catch { /* Ignore malformed marking-scheme links. */ }
                }
              }
              rows.push({ title: "Class " + cls + " Sample Paper " + page.year + " — " + subject, url: target.href,
                snippet: "Official CBSE Academic sample question paper", domain: target.hostname.toLowerCase(), source,
                marking_scheme_url: markingSchemeUrl } as any);
            }
          }
        } catch (e) {
          // An archived session may be withdrawn; keep searching the other published sessions.
          if (pages.length === 1) throw e;
        }
      }
    }
  }
  if (source.domain === "cbse.gov.in") {
    try { rows.push(...await crawlCbseZipArchives(source, query)); }
    catch (e) { throw new Error("CBSE ZIP archive: " + clip((e as Error)?.message || e, 180)); }
  }
  return rows.slice(0, 80);
}
async function crawlCisceOfficial(source: any, query: string): Promise<DiscoveryRow[]> {
  const terms = queryTerms(query);
  const rows: DiscoveryRow[] = [];
  const mediaEndpoint = "https://cisce.org/wp-json/wp/v2/media?search=" + encodeURIComponent([...terms, "question paper"].join(" "))
    + "&media_type=application&mime_type=application%2Fpdf&per_page=50";
  try {
    const { response } = await fetchAllowed(mediaEndpoint, [source.domain], "application/json");
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error("CISCE media search returned an unexpected response.");
    for (const item of data) {
      const raw = String(item.source_url || ""); let target: URL;
      try { target = new URL(raw); } catch { continue; }
      const title = htmlText(String(item.title?.rendered || item.slug || "CISCE question paper"));
      if (!safeHost(target, [source.domain]) || !/\.pdf(?:$|[?#])/i.test(target.href) || !matchesQuery(title + " " + raw, terms)) continue;
      rows.push({ title, url: target.href, snippet: "Official CISCE PDF library item", domain: target.hostname.toLowerCase(), source });
    }
  } catch (e) {
    // Continue with the public WordPress search endpoint when media search is unavailable.
  }
  const searchEndpoint = "https://cisce.org/wp-json/wp/v2/search?search=" + encodeURIComponent([...terms, "specimen question paper"].join(" "))
    + "&per_page=30";
  const search = await fetchAllowed(searchEndpoint, [source.domain], "application/json");
  const pages = await search.response.json();
  if (!Array.isArray(pages)) throw new Error("CISCE public search returned an unexpected response.");
  for (const item of pages.slice(0, 6)) {
    const pageUrl = String(item.url || item.url?.rendered || "");
    let target: URL; try { target = new URL(pageUrl); } catch { continue; }
    if (!safeHost(target, [source.domain])) continue;
    const page = await fetchAllowed(target.href, [source.domain], "text/html,application/xhtml+xml");
    const html = new TextDecoder().decode(await readBounded(page.response, 2 * 1024 * 1024));
    rows.push(...linkRows(html, page.url, source, terms, 20).map((row) => ({
      ...row, snippet: "Official CISCE paper linked from " + htmlText(String(item.title || "CISCE page")).slice(0, 120),
    })));
  }
  const unique = new Map<string, DiscoveryRow>();
  for (const row of rows) if (!unique.has(row.url)) unique.set(row.url, row);
  return [...unique.values()].slice(0, 80);
}
async function crawlSchoolOfficial(source: any, query: string): Promise<DiscoveryRow[]> {
  const terms = queryTerms(query); const rows: DiscoveryRow[] = [];
  const home = "https://" + source.domain + "/";
  const { response, url } = await fetchAllowed(home, [source.domain], "text/html,application/xhtml+xml");
  const html = new TextDecoder().decode(await readBounded(response, 1024 * 1024));
  rows.push(...linkRows(html, url, source, terms, 30));
  try {
    const map = await fetchAllowed("https://" + source.domain + "/sitemap.xml", [source.domain], "application/xml,text/xml");
    const xml = new TextDecoder().decode(await readBounded(map.response, 1024 * 1024));
    let sitemapLocations = [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map((m) => decodeEntities(m[1].trim()));
    const nestedSitemaps = sitemapLocations.filter((u) => /sitemap/i.test(u)).slice(0, 2);
    for (const sitemapUrl of nestedSitemaps) {
      try {
        const nested = await fetchAllowed(sitemapUrl, [source.domain], "application/xml,text/xml");
        const nestedXml = new TextDecoder().decode(await readBounded(nested.response, 1024 * 1024));
        sitemapLocations.push(...[...nestedXml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map((m) => decodeEntities(m[1].trim())));
      } catch { /* Continue with other public sitemap entries. */ }
    }
    const pages = [...new Set(sitemapLocations)]
      .filter((u) => /question|exam|academic|download|resource|paper|assessment/i.test(u) && !/sitemap/i.test(u)).slice(0, 5);
    for (const page of pages) {
      let target: URL; try { target = new URL(page); } catch { continue; }
      if (!safeHost(target, [source.domain])) continue;
      const result = await fetchAllowed(target.href, [source.domain], "text/html,application/xhtml+xml");
      const pageHtml = new TextDecoder().decode(await readBounded(result.response, 1024 * 1024));
      rows.push(...linkRows(pageHtml, result.url, source, terms, 15));
    }
  } catch { /* A missing sitemap is normal; homepage links remain usable. */ }
  const unique = new Map<string, DiscoveryRow>(); for (const row of rows) if (!unique.has(row.url)) unique.set(row.url, row);
  return [...unique.values()].slice(0, 40);
}

async function fetchCandidatePdf(candidate: any, domains: string[]) {
  const archiveMember = String(candidate.discovery_metadata?.archive_member || "");
  const urlText = candidate.pdf_url || candidate.source_url;
  const archive = await fetchAllowed(urlText, domains, archiveMember
    ? "application/zip,application/octet-stream,application/x-zip-compressed"
    : "application/pdf,application/octet-stream");
  if (!archiveMember) return archive;
  const zipBytes = await readBounded(archive.response);
  const memberBytes = getPdfZipMember(zipBytes, archiveMember);
  const responseBytes = new ArrayBuffer(memberBytes.byteLength);
  new Uint8Array(responseBytes).set(memberBytes);
  return { response: new Response(responseBytes, { headers: { "Content-Type": "application/pdf", "Content-Length": String(memberBytes.length) } }), url: archive.url };
}
async function crawlCbseZipArchives(source: any, query: string): Promise<DiscoveryRow[]> {
  const landing = "https://www.cbse.gov.in/cbsenew/question-paper.html";
  const { response, url } = await fetchAllowed(landing, [source.domain], "text/html,application/xhtml+xml");
  const html = new TextDecoder().decode(await readBounded(response, 2 * 1024 * 1024));
  const rows: DiscoveryRow[] = [];
  const tableRows = html.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
  for (const row of tableRows) {
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)];
    if (cells.length < 2) continue;
    const subject = htmlText(cells[0][1]);
    if (!subject || !matchesQuery(subject, queryTerms(query))) continue;
    for (const link of cells[1][1].matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      let target: URL; try { target = new URL(decodeEntities(link[1]), url); } catch { continue; }
      if (!safeHost(target, [source.domain]) || !/\.zip(?:$|[?#])/i.test(target.href)) continue;
      const { response: zipResponse } = await fetchAllowed(target.href, [source.domain], "application/zip,application/octet-stream");
      const zipBytes = await readBounded(zipResponse);
      const members = listPdfMembersFromZip(zipBytes);
      for (const member of members) rows.push({
        title: subject + " — " + member.name.split("/").pop(),
        url: target.href, snippet: "Official CBSE paper inside ZIP archive",
        domain: target.hostname.toLowerCase(), source, archive_member: member.name,
      } as any);
    }
  }
  return rows.slice(0, 80);
}

async function readBounded(res: Response, maxBytes = MAX_PDF_BYTES): Promise<Uint8Array> {
  const declared = Number(res.headers.get("content-length") || 0);
  if (declared > maxBytes) throw new Error(maxBytes === MAX_PDF_BYTES ? "PDF exceeds the 50 MB limit." : "Source page exceeds the 2 MB inspection limit.");
  if (!res.body) throw new Error("Source returned an empty response.");
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) { await reader.cancel(); throw new Error(maxBytes === MAX_PDF_BYTES ? "PDF exceeds the 50 MB limit." : "Source page exceeds the 2 MB inspection limit."); }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
  return all;
}
async function sha256(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function isPdf(bytes: Uint8Array): boolean {
  const head = new TextDecoder().decode(bytes.slice(0, Math.min(1024, bytes.length)));
  return head.includes("%PDF-");
}
async function resolvePdf(candidate: any, domains: string[]) {
  const choices = [candidate.pdf_url, candidate.source_url].filter(Boolean) as string[];
  for (const candidateUrl of choices) {
    let parsed: URL;
    try { parsed = new URL(candidateUrl); } catch { continue; }
    if (!safeHost(parsed, domains)) continue;
    const result = await fetchAllowed(parsed.href, domains, "application/pdf,application/octet-stream,text/html;q=0.8,*/*;q=0.5");
    const type = (result.response.headers.get("content-type") || "").toLowerCase();
    if (type.includes("pdf") || /\.pdf(?:$|[?#])/i.test(result.url)) return result;
    if (candidate.discovery_metadata?.pdf_search_hint) {
      if (type && !type.includes("octet-stream") && !type.includes("binary")) throw new Error("The search result did not return a direct PDF response.");
      const bytes = await readBounded(result.response);
      if (!isPdf(bytes)) throw new Error("The download endpoint did not return PDF file content.");
      const body = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(body).set(bytes);
      return { response: new Response(body, { headers: result.response.headers }), url: result.url };
    }
    const html = await result.response.text();
    for (const link of extractDocumentTargets(html, result.url)) {
      const u = new URL(link);
      if (!safeHost(u, domains)) continue;
      const pdf = await fetchAllowed(u.href, domains, "application/pdf,application/octet-stream,text/html;q=0.8,*/*;q=0.5");
      const pdfType = (pdf.response.headers.get("content-type") || "").toLowerCase();
      if (pdfType.includes("pdf") || /\.pdf(?:$|[?#])/i.test(pdf.url)) return pdf;
      const bytes = await readBounded(pdf.response);
      if (isPdf(bytes)) {
        const body = new ArrayBuffer(bytes.byteLength); new Uint8Array(body).set(bytes);
        return { response: new Response(body, { headers: { "Content-Type": "application/pdf", "Content-Length": String(bytes.length) } }), url: pdf.url };
      }
    }
  }
  throw new Error("No accessible PDF was found on this source page.");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply(405, { error: "Use POST." });
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return reply(500, { error: "Server configuration is incomplete." });
  const admin = createClient(supabaseUrl, serviceKey);
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return reply(401, { error: "Please sign in again." });
  const { data: profile } = await admin.from("profiles").select("role,admin_name,username").eq("id", auth.user.id).maybeSingle();
  if (profile?.role !== "Admin") return reply(403, { error: "Only Admin can discover and import online papers." });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply(400, { error: "Invalid request." }); }
  const action = clip(body.action, 30);


  if (action === "website_scan") {
    const criteria = clip(body.criteria || "question paper", 300);
    const requestedRunId = clip(body.run_id, 64);
    let root: URL;
    let rootHost = "";
    let runId = "";
    let state: any = {};
    if (requestedRunId) {
      if (!uuid(requestedRunId)) return reply(400, { error: "Invalid website scan run." });
      const { data: existing, error } = await admin.from("qb_paper_discovery_runs").select("id,query_text,filters,status").eq("id", requestedRunId).single();
      if (error || !existing || existing.filters?.search_mode !== "website_scan") return reply(404, { error: "Website scan run was not found." });
      if (existing.status === "completed") return reply(200, { run_id: existing.id, complete: true, website_scan: true, pages_scanned: existing.filters?.pages_scanned || 0, pages_remaining: 0, pdfs_found: (existing.filters?.search_results || []).length, preview_results: existing.filters?.search_results || [], provider_errors: existing.filters?.provider_errors || [] });
      try { root = new URL(existing.filters.website_url); } catch { return reply(400, { error: "Saved website URL is invalid." }); }
      rootHost = canonicalWebsiteScanDomain(root.hostname);
      root.hostname = rootHost;
      state = existing.filters?.website_scan_state || {};
      runId = existing.id;
    } else {
      const rawUrl = clip(body.website_url, 2000);
      try { root = new URL(rawUrl); } catch { return reply(400, { error: "Enter a valid website URL, including https://." }); }
      if (root.protocol !== "https:" || root.username || root.password || root.port) return reply(400, { error: "Website scans require a public HTTPS URL without credentials or a custom port." });
      rootHost = canonicalWebsiteScanDomain(root.hostname);
      if (!rootHost || rootHost === "localhost" || rootHost.endsWith(".local") || /^\d{1,3}(\.\d{1,3}){3}$/.test(rootHost)) return reply(400, { error: "This website host is not eligible for scanning." });
      // A document-view URL is an explicit single-page target, not a request to crawl the whole host.
      const singlePageMode = /\/view\/[0-9a-f-]{30,}\/?$/i.test(root.pathname);
      const aglasemCollectionMode = isAglaSemCollectionUrl(root);
      state = { page_queue: [root.href], sitemap_queue: singlePageMode || aglasemCollectionMode ? [] : [new URL("/sitemap.xml", root.origin).href, new URL("/sitemap_index.xml", root.origin).href], single_page_mode: singlePageMode, aglasem_collection_mode: aglasemCollectionMode, visited: [], results: [], errors: [], audit: {} };
    }
    const approvedHosts = isAglaSemDomain(rootHost) ? ["aglasem.com"] : [rootHost];
    const source = { id: null, display_name: rootHost, domain: rootHost, source_type: "education_portal", trust_level: "review", enabled: true };
    const normalizeQueue = (items: unknown[]) => [...new Set(items.flatMap((value) => {
      try { const u = canonicalScanUrl(new URL(String(value)), rootHost); return safeHost(u, approvedHosts) ? [u.href] : []; }
      catch { return []; }
    }))];
    const singlePageMode = state.single_page_mode === true || /\/view\/[0-9a-f-]{30,}\/?$/i.test(root.pathname);
    const aglasemCollectionMode = state.aglasem_collection_mode === true || isAglaSemCollectionUrl(root);
    if (singlePageMode && state.single_page_mode !== true) {
      // Discard legacy site-wide queues for a document-view URL and start with that exact page.
      state = { page_queue: [root.href], sitemap_queue: [], single_page_mode: true, visited: [], results: [], errors: [] };
    }
    const pageQueue: string[] = normalizeQueue(Array.isArray(state.page_queue) ? state.page_queue : []);
    const sitemapQueue: string[] = (singlePageMode || aglasemCollectionMode) ? [] : normalizeQueue(Array.isArray(state.sitemap_queue) ? state.sitemap_queue : []);
    const visited = new Set<string>(Array.isArray(state.visited) ? state.visited : []);
    const discovered = new Map<string, any>((Array.isArray(state.results) ? state.results : []).map((row: any) => [String(row.url).toLowerCase(), row]));
    const errors: string[] = Array.isArray(state.errors) ? state.errors : [];
    const audit = { parent_document_links_discovered: 0, document_pages_fetched: 0, download_endpoints_extracted: 0, candidates_rejected: 0, ...(state.audit || {}) };
    const terms = queryTerms(criteria);
    // Explicit document-view URLs are inspected in isolation; never expand them into a domain crawl.
    let sitemapBudget = (singlePageMode || aglasemCollectionMode) ? 0 : 8;
    while (sitemapQueue.length && sitemapBudget-- > 0) {
      const sitemapUrl = sitemapQueue.shift()!;
      try {
        const map = await fetchAllowed(sitemapUrl, approvedHosts, "application/xml,text/xml");
        const xml = new TextDecoder().decode(await readBounded(map.response, 2 * 1024 * 1024));
        const sitemapUrls: URL[] = [];
        const pageUrls: Array<{ url: URL; score: number }> = [];
        for (const match of xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)) {
          try {
            const u = canonicalScanUrl(new URL(decodeEntities(match[1].trim())), rootHost);
            if (!safeHost(u, approvedHosts)) continue;
            if (/\.xml(?:$|[?#])/i.test(u.pathname)) {
              if (sitemapQueue.length + sitemapUrls.length < 40) sitemapUrls.push(u);
            } else if (!/\.(?:gz|zip|jpg|jpeg|png|gif|svg|css|js|webp)(?:$|[?#])/i.test(u.pathname)) {
              const score = websiteUrlRelevance(u, criteria);
              if (score >= 20) pageUrls.push({ url: u, score });
            }
          } catch { /* ignore malformed sitemap entries */ }
        }
        sitemapQueue.push(...sitemapUrls.map((u) => u.href));
        pageUrls.sort((a, b) => b.score - a.score);
        const knownPages = new Set(pageQueue);
        for (const item of pageUrls.slice(0, 250)) if (!knownPages.has(item.url.href)) {
          pageQueue.push(item.url.href); knownPages.add(item.url.href);
        }
      } catch (e) { errors.push("Sitemap " + sitemapUrl + ": " + clip((e as Error)?.message || e, 180)); }
    }
    let pageBudget = 12;
    while (pageQueue.length && pageBudget-- > 0) {
      const pageUrl = pageQueue.shift()!;
      let page: URL; try { page = new URL(pageUrl); } catch { continue; }
      const canonical = page.href.split("#")[0];
      if (visited.has(canonical) || !safeHost(page, approvedHosts)) continue;
      visited.add(canonical);
      try {
        const fetched = await fetchAllowed(canonical, approvedHosts, "text/html,application/xhtml+xml,application/pdf,application/octet-stream");
        const type = (fetched.response.headers.get("content-type") || "").toLowerCase();
        const looksPdf = type.includes("application/pdf") || /\.pdf(?:$|[?#])/i.test(fetched.url);
        if (looksPdf) {
          const bytes = new Uint8Array(await readBounded(fetched.response, MAX_PDF_BYTES));
          if (bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-") {
            const row = { title: page.pathname.split("/").pop() || "Question paper PDF", url: fetched.url, snippet: "PDF file discovered during website scan", domain: page.hostname.toLowerCase().replace(/^www\./, ""), source_name: rootHost, source_match: "website_scan", search_provider: "Website crawler", source_page_url: canonical };
            if (isQuestionPaperPdf(row, criteria)) discovered.set(row.url.toLowerCase(), row);
            else audit.candidates_rejected++;
          }
          continue;
        }
        if (type && !type.includes("html") && !type.includes("xhtml")) continue;
        const html = new TextDecoder().decode(await readBounded(fetched.response, 2 * 1024 * 1024));
        const isAglaSemDocumentPage = isAglaSemDomain(rootHost) && new URL(fetched.url).pathname.toLowerCase().includes("/view/");
        if (isAglaSemDocumentPage) audit.document_pages_fetched++;
        for (const row of linkRows(html, fetched.url, source, terms, 200)) {
          const candidate = { ...row, source_page_url: fetched.url };
          discovered.set(candidate.url.toLowerCase(), candidate);
        }
        const pageText = htmlText(html);
        const docTitle = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
        const documentTitle = htmlText(docTitle) || pageText.slice(0, 240);
        const pageMatchesCriteria = matchesQuery(pageText + " " + documentTitle, terms);
        const pageHasPaperSignal = /question[-_ ]paper|previous[-_ ]year|past[-_ ]paper|sample[-_ ]paper|exam[-_ ]paper/i.test(pageText + " " + documentTitle);

        // AglaSem exposes the actual PDF through a single-doc-download endpoint.
        // Inspect embedded/data URLs as well as anchors; these links are not always
        // present as ordinary .pdf hrefs on the document page.
        const isAglaSemDocsPage = (rootHost === "aglasem.com" || rootHost === "docs.aglasem.com") &&
          new URL(fetched.url).hostname === "docs.aglasem.com";
        if (isAglaSemDocsPage && (aglasemCollectionMode || pageHasPaperSignal)) {
          for (const targetUrl of extractDocumentTargets(html, fetched.url)) {
            let target: URL;
            try { target = new URL(targetUrl); } catch { continue; }
            if (!/single-doc-download/i.test(target.pathname)) continue;
            audit.download_endpoints_extracted++;
            const row = {
              title: documentTitle || (root.pathname + " Question Paper"),
              url: target.href,
              snippet: "Question paper PDF download endpoint linked from AglaSem collection " + root.pathname + " · " + documentTitle,
              domain: target.hostname.toLowerCase().replace(/^www\./, ""),
              source_name: rootHost,
              source_match: "website_scan",
              search_provider: "Website crawler",
              pdf_search_hint: true,
              source_page_url: fetched.url,
            };
            if (isQuestionPaperPdf(row, criteria)) discovered.set(row.url.toLowerCase(), row);
          }
        }
        const anchors = html.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) || [];
        for (const anchor of anchors) {
          const href = anchor.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1] || "";
          if (!href) continue;
          try {
            const target = canonicalScanUrl(new URL(decodeEntities(href), fetched.url), rootHost);
            if (!safeHost(target, [rootHost]) || /\.(?:zip|jpg|jpeg|png|gif|svg|css|js|xml)(?:$|[?#])/i.test(target.pathname)) continue;
            const isAglaSemDocs = (rootHost === "aglasem.com" || rootHost === "docs.aglasem.com") && target.hostname === "docs.aglasem.com";
            const isAglaSemDocument = isAglaSemDocs && /\/view\/[0-9a-f-]{30,}/i.test(target.pathname);
            const isAglaSemDownload = isAglaSemDocs && /single-doc-download/i.test(target.pathname);
            if (isAglaSemDownload && (aglasemCollectionMode || (pageMatchesCriteria && pageHasPaperSignal))) {
              discovered.set(target.href.toLowerCase(), {
                  title: documentTitle || (root.pathname + " Question Paper"),
                  url: target.href,
                snippet: "Question paper PDF download endpoint linked from AglaSem collection " + root.pathname + " · " + documentTitle,
                domain: rootHost, source, pdf_search_hint: true,
                source_page_url: fetched.url,
              });
              continue;
            }
            const score = websiteUrlRelevance(target, criteria);
            const shouldFollowDocument = isAglaSemDocument && pageMatchesCriteria && pageHasPaperSignal;
            const shouldFollowAglaSemCollectionDocument = aglasemCollectionMode && isAglaSemDocument;
            if (!singlePageMode && (aglasemCollectionMode ? shouldFollowAglaSemCollectionDocument : (score >= 20 || shouldFollowDocument)) && pageQueue.length < 5000 &&
                !visited.has(target.href) && !pageQueue.includes(target.href)) {
              pageQueue.push(target.href);
              if (shouldFollowAglaSemCollectionDocument) audit.parent_document_links_discovered++;
            }
          } catch { /* ignore malformed links */ }
        }
      } catch (e) { errors.push(page.hostname + page.pathname + ": " + clip((e as Error)?.message || e, 180)); }
    }
    const results = [...discovered.values()].filter((row) => isQuestionPaperPdf(row, criteria)).slice(0, MAX_DISCOVERED_CANDIDATES_PER_BATCH).map((row: any) => ({
      title: clip(row.title, 500), url: row.url, domain: row.domain, snippet: clip(row.snippet, 1200),
      source_name: rootHost, source_match: "website_scan", search_provider: "Website crawler",
      source_page_url: row.source_page_url || root.href,
    }));
    audit.candidates_rejected += Math.max(0, discovered.size - results.length);
    const complete = pageQueue.length === 0 && sitemapQueue.length === 0;
    const filters = { scope: "board", search_mode: "website_scan", website_url: root.href, website_domain: rootHost,
      pages_scanned: visited.size, pages_queued: pageQueue.length, sitemap_queue_remaining: sitemapQueue.length,
      search_results: results, provider_errors: errors.slice(0, 100),
      website_scan_state: complete ? null : { page_queue: pageQueue.slice(0, 5000), sitemap_queue: sitemapQueue.slice(0, 500), single_page_mode: singlePageMode, aglasem_collection_mode: aglasemCollectionMode,
        visited: [...visited].slice(-10000), results, errors: errors.slice(-100), audit },
      discovery_progress: { next_offset: visited.size, successful_queries: visited.size, provider_errors: errors.slice(0, 80), results_found: results.length, new_candidates: 0, audit } };
    let run: any;
    if (runId) {
      const { data, error } = await admin.from("qb_paper_discovery_runs").update({ status: complete ? "completed" : "running", results_found: results.length, filters, completed_at: complete ? new Date().toISOString() : null, heartbeat_at: new Date().toISOString() }).eq("id", runId).select("id").single();
      if (error || !data) return reply(500, { error: "Could not save website scan progress: " + (error?.message || "unknown error") });
      run = data;
    } else {
      const { data, error } = await admin.from("qb_paper_discovery_runs").insert({ query_text: criteria, status: complete ? "completed" : "running", results_found: results.length, filters, started_by: auth.user.id, completed_at: complete ? new Date().toISOString() : null, heartbeat_at: new Date().toISOString() }).select("id").single();
      if (error || !data) return reply(500, { error: "Could not save website scan progress: " + (error?.message || "unknown error") });
      run = data;
    }
    return reply(200, { run_id: run.id, complete, website_scan: true, pages_scanned: visited.size,
      pages_remaining: pageQueue.length, sitemaps_remaining: sitemapQueue.length, pdfs_found: results.length,
      preview_results: results, provider_errors: errors, audit, message: complete ? "Website scan complete. Results are saved for review; no PDFs were downloaded, verified, or imported." : "Website scan batch saved. Resume this run to continue scanning; results are not yet complete." });
  }
  if (action === "collect") {
    const runId = clip(body.run_id, 64);
    if (!uuid(runId)) return reply(400, { error: "Invalid discovery run." });
    const { data: run, error: runError } = await admin.from("qb_paper_discovery_runs").select("id,status,filters,query_text").eq("id", runId).maybeSingle();
    if (runError || !run) return reply(404, { error: "Discovery run not found." });
    if (run.status !== "completed") return reply(409, { error: "Finish or resume Search before collecting its results." });
    const saved = Array.isArray(run.filters?.search_results) ? run.filters.search_results : [];
    if (!saved.length) return reply(409, { error: "This search has no saved PDF results. Run a fresh Search." });
    const registry = Array.isArray(run.filters?.source_snapshot) ? run.filters.source_snapshot : [];
    let created = 0, linked = 0, skipped = 0;
    const candidateIds: string[] = [];
    for (const row of saved.slice(0, 1000)) {
      let url: URL;
      try { url = new URL(String(row.url || "")); } catch { skipped++; continue; }
      const domain = url.hostname.toLowerCase().replace(/^www\./, "");
      if (url.protocol !== "https:" || !isQuestionPaperPdf(row, String(run.query_text || ""))) { skipped++; continue; }
      if (registry.some((s: any) => !s.enabled && (domain === s.domain || domain.endsWith("." + s.domain)))) { skipped++; continue; }
      const source = registry.find((s: any) => s.enabled && (domain === s.domain || domain.endsWith("." + s.domain)));
      const { data: existing } = await admin.from("qb_paper_discovery_candidates").select("id").eq("source_url", url.href).maybeSingle();
      let candidateId = existing?.id || null;
      if (!candidateId) {
        const { data: inserted, error: insertError } = await admin.from("qb_paper_discovery_candidates").insert({
          discovery_run_id: runId, source_id: source?.id || null,
          source_type: source?.source_type || (run.filters?.scope === "school" ? "school" : "education_portal"),
          source_domain: domain, title: clip(row.title || url.pathname.split("/").pop() || domain, 500),
          source_url: url.href, pdf_url: url.href, discovered_school_name: clip(run.filters?.school_name || "", 200) || null,
          verification_status: "unverified", status: "discovered",
          discovery_metadata: { source_match: source ? "approved_registry" : "unregistered_domain",
            source_name: clip(row.source_name || domain, 200), search_provider: clip(row.search_provider || "Web search", 80),
            snippet: clip(row.snippet || "", 1200), source_page_url: clip(row.source_page_url || "", 2000), pdf_search_hint: true, collected_from_search: true },
          discovered_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).select("id").single();
        if (insertError) {
          if (insertError.code === "23505") {
            const { data: raced } = await admin.from("qb_paper_discovery_candidates").select("id").eq("source_url", url.href).maybeSingle();
            candidateId = raced?.id || null;
          } else return reply(500, { error: "Could not create a candidate: " + insertError.message });
        } else { candidateId = inserted.id; created++; }
      }
      if (!candidateId) { skipped++; continue; }
      const { error: linkError } = await admin.from("qb_paper_discovery_run_candidates")
        .upsert({ discovery_run_id: runId, candidate_id: candidateId }, { onConflict: "discovery_run_id,candidate_id", ignoreDuplicates: true });
      if (linkError) return reply(500, { error: "Could not link candidate to this search: " + linkError.message });
      candidateIds.push(candidateId); linked++;
    }
    return reply(200, { collected: true, created, linked, skipped, candidate_ids: candidateIds,
      message: "Saved search results collected. No PDFs were downloaded or verified." });
  }

  if (action === "search" || action === "continue_search" || action === "restart_search") {
    const isNewRun = action === "search";
    const isRestart = action === "restart_search";
    let run: any = null;
    let query = "";
    let scope = "board";
    let schoolName = "";
    let runId = "";

    if (isNewRun) {
      const rawQuery = clip(body.query, 400);
      scope = body.scope === "school" ? "school" : "board";
      schoolName = scope === "school" ? clip(body.school_name, 200) : "";
      query = [schoolName, rawQuery].filter(Boolean).join(" ").slice(0, 500);
      if (query.length < 2) return reply(400, { error: "Enter a search phrase." });
      const { data: created, error: createError } = await admin.from("qb_paper_discovery_runs")
        .insert({ query_text: query, filters: { scope, school_name: schoolName || null,
          search_mode: "targeted_domains_plus_web_batched", discovery_progress: {
            next_offset: 0, successful_queries: 0, provider_errors: [], results_found: 0, new_candidates: 0,
          } }, heartbeat_at: new Date().toISOString(), started_by: auth.user.id }).select("*").single();
      if (createError || !created) return reply(500, { error: "Could not start the discovery run." });
      run = created;
      runId = created.id;
    } else {
      runId = clip(body.run_id, 64);
      if (!uuid(runId)) return reply(400, { error: "Invalid discovery run." });
      const { data: existing, error: loadError } = await admin.from("qb_paper_discovery_runs")
        .select("*").eq("id", runId).maybeSingle();
      if (loadError || !existing) return reply(404, { error: "Discovery run not found." });
      query = String(existing.query_text || "");
      scope = existing.filters?.scope === "school" ? "school" : "board";
      schoolName = clip(existing.filters?.school_name, 200);
      if (isRestart) {
        if (existing.status === "running") return reply(409, { error: "This run is already running. Resume it instead of restarting." });
        const { data: priorCandidates, error: countError } = await admin.from("qb_paper_discovery_candidates")
          .select("id").eq("discovery_run_id", runId);
        if (countError) return reply(500, { error: "Could not inspect existing candidates before restart: " + countError.message });
        const preservedCount = priorCandidates?.length || 0;
        const resetFilters = { ...existing.filters, source_snapshot: null, search_results: [], discovery_progress: {
          next_offset: 0, successful_queries: 0, provider_errors: [],
          results_found: preservedCount, new_candidates: 0,
          previously_seen_pdf_urls: 0, unprocessed_pdf_links: 0, discovered_source_count: 0,
        } };
        const { data: restarted, error: restartError } = await admin.from("qb_paper_discovery_runs")
          .update({ status: "running", filters: resetFilters, results_found: preservedCount,
            heartbeat_at: new Date().toISOString(), error_message: null, completed_at: null, started_at: new Date().toISOString() })
          .eq("id", runId).eq("status", existing.status).select("*").maybeSingle();
        if (restartError || !restarted) return reply(409, { error: "The run changed while restart was requested. Refresh Recent searches and try again." });
        run = restarted;
      } else {
        if (existing.status === "failed") {
          const savedProgress = existing.filters?.discovery_progress;
          if (!savedProgress || !Number.isFinite(Number(savedProgress.next_offset))) {
            return reply(409, { error: "This run has no saved checkpoint. Use Restart from beginning to run it again." });
          }
          const { data: resumed, error: resumeError } = await admin.from("qb_paper_discovery_runs")
            .update({ status: "running", heartbeat_at: new Date().toISOString(), error_message: null, completed_at: null })
            .eq("id", runId).eq("status", "failed").select("*").maybeSingle();
          if (resumeError || !resumed) return reply(409, { error: "The run changed while resume was requested. Refresh Recent searches." });
          run = resumed;
        } else if (existing.status !== "running") {
          return reply(200, { run_id: runId, complete: true,
            found: existing.results_found || 0, new_candidates: 0, message: "This discovery run is already complete." });
        } else {
          // A previous invocation may have been killed by the Edge Function CPU limit.
          // Claim only an idle or expired lease; the conditional update prevents two
          // concurrent Resume requests from processing the same source checkpoint.
          const staleBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString();
          const leaseAt = new Date().toISOString();
          const { data: claimed, error: claimError } = await admin.from("qb_paper_discovery_runs")
            .update({ heartbeat_at: leaseAt })
            .eq("id", runId).eq("status", "running")
            .or("heartbeat_at.is.null,heartbeat_at.lt." + staleBefore)
            .select("*").maybeSingle();
          if (claimError || !claimed) {
            return reply(409, { error: "This discovery run is already being processed. If its previous attempt timed out, wait five minutes and select Resume again." });
          }
          run = claimed;
        }
      }
    }

    let registry: any[] = Array.isArray(run.filters?.source_snapshot) ? run.filters.source_snapshot : [];
    if (!Array.isArray(run.filters?.source_snapshot)) {
      const { data: sources, error: sourceError } = await admin.from("qb_paper_discovery_sources")
        .select("id,display_name,domain,source_type,trust_level,priority,enabled")
        .order("priority").limit(300);
      if (sourceError) return reply(500, { error: "Could not load approved source registry: " + sourceError.message });
      registry = sources || [];
      const snapshotFilters = { ...run.filters, source_snapshot: registry };
      const { error: snapshotError } = await admin.from("qb_paper_discovery_runs")
        .update({ filters: snapshotFilters }).eq("id", runId);
      if (snapshotError) return reply(500, { error: "Could not preserve the source snapshot for this run: " + snapshotError.message });
      run.filters = snapshotFilters;
    }
    const eligible = registry.filter((s: any) => s.enabled &&
      (s.source_type === scope || s.source_type === "education_portal"));
    const eligibleBoards = filterBoardSourcesForQuery(
      eligible.filter((s: any) => s.source_type === "board"), query,
    );
    const searchTargets = scope === "school"
      ? eligible.filter((s: any) => s.source_type === "school")
      : [...eligibleBoards, ...eligible.filter((s: any) => s.source_type === "education_portal")];
    // Broad PDF search still runs when no registry entries are enabled. A disabled
    // registry domain is never silently re-enabled or reintroduced by broad search.

    const progress = run.filters?.discovery_progress || {};
    const offset = Math.max(0, Number(progress.next_offset) || 0);
    const batch = searchTargets.slice(offset, offset + 1);
    const providerErrors: string[] = Array.isArray(progress.provider_errors) ? progress.provider_errors.slice(0, 80) : [];
    let successfulQueries = Math.max(0, Number(progress.successful_queries) || 0);
    let foundTotal = Math.max(0, Number(progress.results_found) || 0);
    let insertedTotal = 0;
    const batchRows: any[] = [];

    // One registered domain per invocation keeps each Edge Function execution bounded.
    const targeted = await searchInBatches(batch, query, 1);
    batchRows.push(...targeted.results);
    providerErrors.push(...targeted.errors);
    successfulQueries += targeted.successfulQueries;

    for (const source of batch) {
      try {
        if (scope === "board" && ["cbse.gov.in", "cbseacademic.nic.in"].includes(source.domain)) {
          batchRows.push(...await crawlCbseOfficial(source, query));
          successfulQueries++;
        } else if (scope === "board" && source.domain === "cisce.org") {
          batchRows.push(...await crawlCisceOfficial(source, query));
          successfulQueries++;
        } else if (source.source_type === "education_portal" || source.source_type === "school") {
          batchRows.push(...await crawlSchoolOfficial(source, query));
          successfulQueries++;
        }
      } catch (e) {
        providerErrors.push(source.domain + ": " + clip((e as Error)?.message || e, 220));
      }
    }

    const nextOffset = offset + batch.length;
    const complete = nextOffset >= searchTargets.length;
    let broadResults: any[] = [];
    if (complete) {
      // Always run broad discovery after registered-source crawling. A handful of
      // sample-paper hits must not suppress searches for annual / previous-year papers.
      const broadQueries = buildPdfQueryVariants(query);
      const broadSearches = broadQueries.flatMap((broadQuery) => [0, 30].map((offset) => ({ broadQuery, offset })));
      const broadSettled = await Promise.all(broadSearches.map(async (search) => {
        try {
          const result = await searchWeb(search.broadQuery, 20, undefined, search.offset);
          return { rows: result.rows, successfulQueries: result.providersSucceeded.length,
            error: result.providerErrors.join(" · ") };
        } catch (e) { return { rows: [], successfulQueries: 0, error: clip((e as Error)?.message || e, 300) }; }
      }));
      for (let i = 0; i < broadSettled.length; i++) {
        const item = broadSettled[i];
        if (item.error) providerErrors.push("Broad web search (" + (i + 1) + ", offset " + broadSearches[i].offset + "): " + item.error);
        successfulQueries += Number(item.successfulQueries || 0);
        broadResults.push(...item.rows);
      }
    }
    const allRows = [...batchRows, ...broadResults.map((r) => {
      const matched = registry.find((s: any) => s.enabled &&
        (r.domain === s.domain || r.domain.endsWith("." + s.domain)));
      const disabled = registry.find((s: any) => !s.enabled &&
        (r.domain === s.domain || r.domain.endsWith("." + s.domain)));
      return { ...r, source: matched || null, disabledSource: disabled || null, pdf_search_hint: /\\.pdf(?:$|[?#])/i.test(r.url) };
    })];
    const disabledRows = allRows.filter((row) => row.disabledSource);
    const rows = allRows.filter((row) => !row.disabledSource);
    const unique = new Map<string, any>();
    for (const row of rows) if (!unique.has(String(row.url).toLowerCase())) unique.set(String(row.url).toLowerCase(), row);
    // Search providers may ignore filetype operators. Never create a paper candidate
    // from an ordinary HTML result: only direct PDF URLs and verified PDF members qualify.
    const flattened = [...unique.values()].filter((r) => isQuestionPaperPdf(r, query));
    // Pre-Search is preview-only. Never create discovery-candidate or review-queue rows here.
    const previewResults = flattened.slice(0, MAX_DISCOVERED_CANDIDATES_PER_BATCH).map((r) => ({
      title: clip(r.title, 500), url: String(r.url), domain: String(r.domain || new URL(String(r.url)).hostname),
      snippet: clip(r.snippet, 1200), source_name: r.source?.display_name || r.domain,
      source_match: r.source ? 'approved_registry' : 'unregistered_domain',
      search_provider: r.snippet.startsWith('Bing RSS search') ? 'Bing RSS' : r.snippet.startsWith('Official CBSE') ? 'CBSE official archive crawler'
        : r.snippet.startsWith('Official CISCE') ? 'CISCE official media crawler'
        : r.snippet.startsWith('Official source page') ? 'Registered source crawler' : 'Web search',
    }));
    foundTotal += previewResults.length;
    const previouslySeenTotal = 0;
    const unprocessedPdfLinksTotal = Math.max(0, Number(progress.unprocessed_pdf_links) || 0)
      + Math.max(0, flattened.length - MAX_DISCOVERED_CANDIDATES_PER_BATCH);
    // Preserve one audit row per checked source attempt, including zero-result and failed checks.
    const sourceAuditRows: any[] = batch.map((source: any) => {
      const matching = batchRows.filter((row: any) => row.source?.id === source.id && isQuestionPaperPdf(row, query));
      const sourceError = providerErrors.find((message) => message.startsWith(source.domain + ":"));
      const partialError = sourceError;
      return {
        discovery_run_id: runId, source_id: source.id, domain: source.domain,
        display_name: source.display_name, source_type: source.source_type,
        source_classification: "approved",
        outcome: matching.length ? "pdf_found" : (sourceError
          ? (/Source returned HTTP|Too many redirects|timed out|Source returned an invalid redirect|Source hostname/i.test(sourceError) ? "inaccessible" : "provider_error")
          : "no_matching_pdf"),
        pdf_count: matching.length,
        provider: "Google Search (Serper) + DuckDuckGo HTML + Bing RSS (independent parallel searches) + source-specific crawler",
        evidence: {
          query_variants: [
            ...buildPdfQueryVariants(query),
          ],
          result_pages: [0, 30],
          result_titles: matching.slice(0, 12).map((row: any) => row.title),
          pdf_urls: matching.slice(0, 12).map((row: any) => row.url),
          diagnostic: partialError || null,
        },
      };
    });
    // Record every unregistered domain surfaced by broad search, including sites
    // that returned no relevant question-paper PDF. This is the per-run discovery inbox.
    const discoveredDomainResults = new Map<string, any[]>();
    const registeredBroadResults = new Map<string, any[]>();
    for (const row of broadResults) {
      if (row.source) {
        const list = registeredBroadResults.get(row.source.id) || [];
        list.push(row); registeredBroadResults.set(row.source.id, list);
      } else if (!row.disabledSource) {
        const list = discoveredDomainResults.get(row.domain) || [];
        list.push(row); discoveredDomainResults.set(row.domain, list);
      }
    }
    const disabledCounts = new Map<string, any[]>();
    for (const row of disabledRows) {
      const domain = row.disabledSource.domain;
      const list = disabledCounts.get(domain) || [];
      list.push(row); disabledCounts.set(domain, list);
    }
    for (const [domain, foundRows] of disabledCounts) {
      const source = foundRows[0].disabledSource;
      const relevant = foundRows.filter((row: any) => isQuestionPaperPdf(row, query));
      sourceAuditRows.push({
        discovery_run_id: runId, source_id: source.id, domain, display_name: source.display_name,
        source_type: source.source_type, source_classification: "approved",
        outcome: "disabled_registry", pdf_count: relevant.length, provider: "Broad web PDF search",
        evidence: { note: "This domain is permanently disabled in the source registry and was excluded.",
          surfaced_result_count: foundRows.length, relevant_pdf_urls: relevant.slice(0, 12).map((row: any) => row.url) },
      });
    }
    for (const [sourceId, surfacedRows] of registeredBroadResults) {
      const source = surfacedRows[0].source;
      const relevant = surfacedRows.filter((row: any) => isQuestionPaperPdf(row, query));
      sourceAuditRows.push({
        discovery_run_id: runId, source_id: source.id, domain: source.domain, display_name: source.display_name,
        source_type: source.source_type, source_classification: "approved",
        outcome: relevant.length ? "pdf_found" : "no_matching_pdf", pdf_count: relevant.length,
        provider: "Broad web PDF search",
        evidence: { surfaced_result_count: surfacedRows.length,
          result_titles: surfacedRows.slice(0, 12).map((row: any) => row.title),
          pdf_urls: relevant.slice(0, 12).map((row: any) => row.url) },
      });
    }
    for (const [domain, surfacedRows] of discoveredDomainResults) {
      const relevant = flattened.filter((row: any) => row.domain === domain);
      sourceAuditRows.push({
        discovery_run_id: runId, source_id: null, domain, display_name: domain,
        source_type: scope === "school" ? "school" : "education_portal",
        source_classification: "discovered",
        outcome: relevant.length ? "pdf_found" : "no_matching_pdf", pdf_count: relevant.length,
        provider: "Broad web PDF search",
        evidence: { surfaced_result_count: surfacedRows.length,
          result_titles: surfacedRows.slice(0, 12).map((row: any) => row.title),
          relevant_pdf_urls: relevant.slice(0, 12).map((row: any) => row.url) },
      });
    }
    if (sourceAuditRows.length) {
      const { error: auditError } = await admin.from("qb_paper_discovery_run_sources").insert(sourceAuditRows);
      if (auditError) providerErrors.push("Source audit could not be saved: " + auditError.message);
    }

    const discoveredSourceTotal = Math.max(0, Number(progress.discovered_source_count) || 0) + discoveredDomainResults.size;
    const priorSavedResults = Array.isArray(run.filters?.search_results) ? run.filters.search_results : [];
    const savedByUrl = new Map<string, any>();
    for (const row of priorSavedResults) if (row?.url) savedByUrl.set(String(row.url).toLowerCase(), row);
    for (const row of previewResults) if (row?.url) savedByUrl.set(String(row.url).toLowerCase(), row);
    const savedSearchResults = [...savedByUrl.values()].slice(0, 1000);
    const nextProgress = { next_offset: nextOffset, successful_queries: successfulQueries,
      provider_errors: providerErrors.slice(0, 80), results_found: foundTotal, new_candidates: insertedTotal,
      previously_seen_pdf_urls: previouslySeenTotal, unprocessed_pdf_links: unprocessedPdfLinksTotal,
      discovered_source_count: discoveredSourceTotal };
    const update: any = { filters: { ...run.filters, search_results: savedSearchResults, discovery_progress: nextProgress },
      results_found: foundTotal, heartbeat_at: null,
      error_message: providerErrors.length ? clip(providerErrors.join(" | "), 1000) : null };
    if (complete) {
      update.status = successfulQueries > 0 || foundTotal > 0 ? "completed" : "failed";
      update.completed_at = new Date().toISOString();
    }
    const { error: progressError } = await admin.from("qb_paper_discovery_runs").update(update).eq("id", runId);
    if (progressError) return reply(500, { error: "Results were saved, but discovery progress could not be updated: " + progressError.message });
    return reply(200, {
      run_id: runId, complete, next_source: complete ? null : searchTargets[nextOffset]?.display_name,
      sources_processed: nextOffset, sources_total: searchTargets.length,
      found: foundTotal, pdfs_found: foundTotal, new_candidates: 0,
      estimated_new_candidates: 0,
      previously_seen_pdf_urls: previouslySeenTotal,
      unprocessed_pdf_links: unprocessedPdfLinksTotal,
      approved_source_results: flattened.filter((r) => r.source).length,
      discovered_source_count: discoveredSourceTotal,
      preview_results: previewResults,
      provider: "Official board archive + Google Search (Serper), DuckDuckGo HTML and Bing RSS",
      provider_successful_queries: successfulQueries, provider_errors: providerErrors.slice(-8),
      message: complete
        ? (providerErrors.length ? "Search completed with partial provider failures. Review provider diagnostics before concluding no papers exist." : "Search completed. Potential PDF records were previewed only; nothing was added to a review queue.")
        : "Search batch complete. Continuing discovery with the next registered source.",
    });
  }

  const candidateId = clip(body.candidate_id, 64);
  if (!uuid(candidateId)) return reply(400, { error: "Invalid candidate." });
  const { data: candidate, error: candidateError } = await admin.from("qb_paper_discovery_candidates").select("*").eq("id", candidateId).maybeSingle();
  if (candidateError || !candidate) return reply(404, { error: "Candidate not found." });
  const { data: sourceRows } = await admin.from("qb_paper_discovery_sources").select("domain,enabled").limit(500);
  const registryRows = sourceRows || [];
  const disabledRegistryMatch = registryRows.find((source: any) =>
    !source.enabled && matchesApprovedSourceDomain(candidate.source_domain, [source.domain]));
  if (disabledRegistryMatch) return reply(400, { error: "This domain is permanently disabled in Approved Sources and was excluded from this collection." });
  const domains = registryRows.filter((source: any) => source.enabled).map((source: any) => source.domain);
  const isEnabledRegisteredSource = matchesApprovedSourceDomain(candidate.source_domain, domains);
  const discoveredDomain = String(candidate.source_domain || "").toLowerCase().trim();
  const validDiscoveredDomain = isValidDiscoveredDomain(discoveredDomain);
  const hasDirectPdfEvidence = candidate.discovery_metadata?.source_match === "unregistered_domain" &&
    (/\.pdf(?:$|[?#])/i.test(String(candidate.pdf_url || candidate.source_url || "")) ||
      !!candidate.discovery_metadata?.archive_member || !!candidate.discovery_metadata?.pdf_search_hint);
  if (!isEnabledRegisteredSource) {
    if (!hasDirectPdfEvidence || !validDiscoveredDomain) {
      return reply(400, { error: "This source is not enabled and the candidate does not contain eligible direct-PDF discovery evidence." });
    }
    // Temporary, candidate-scoped allowlist: only this discovered hostname and its
    // subdomains may be fetched. It is not added to the permanent source registry.
    domains.push(discoveredDomain);
  }

  if (action === "verify") {
    try {
      const pdf = candidate.discovery_metadata?.archive_member
        ? await fetchCandidatePdf(candidate, domains) : await resolvePdf(candidate, domains);
      const bytes = await readBounded(pdf.response);
      if (!isPdf(bytes)) {
        await admin.from("qb_paper_discovery_candidates").update({ verification_status: "invalid_pdf", status: "needs_review", updated_at: new Date().toISOString() }).eq("id", candidateId);
        return reply(422, { error: "The source did not return a valid PDF file." });
      }
      const checksum = await sha256(bytes);
      const { data: duplicate } = await admin.from("qb_source_papers").select("id").eq("checksum", checksum).maybeSingle();
      const { data: duplicateCandidate } = await admin.from("qb_paper_discovery_candidates")
        .select("id").eq("checksum", checksum).neq("id", candidateId).limit(1).maybeSingle();
      const isDuplicate = !!duplicate || !!duplicateCandidate;
      const status = isDuplicate ? "duplicate" : "verified";
      await admin.from("qb_paper_discovery_candidates").update({
        pdf_url: pdf.url, verification_status: status, status: isDuplicate ? "duplicate" : "needs_review",
        checksum, file_size_bytes: bytes.length, duplicate_of_paper_id: duplicate?.id || null,
        discovery_metadata: { ...candidate.discovery_metadata,
          exact_duplicate_candidate_id: duplicateCandidate?.id || null },
        updated_at: new Date().toISOString(),
      }).eq("id", candidateId);
      return reply(200, { verified: !isDuplicate, duplicate: isDuplicate,
        duplicate_paper_id: duplicate?.id || null, duplicate_candidate_id: duplicateCandidate?.id || null,
        pdf_url: pdf.url, checksum, file_size_bytes: bytes.length });
    } catch (e) {
      const message = clip((e as Error)?.message || e, 500);
      const status = /outside|invalid url|redirect/i.test(message) ? "unsafe_url" : "inaccessible";
      await admin.from("qb_paper_discovery_candidates").update({ verification_status: status, status: "needs_review", rejection_reason: message, updated_at: new Date().toISOString() }).eq("id", candidateId);
      return reply(422, { error: message });
    }
  }

  if (action === "import") {
    if (candidate.status !== "approved_for_import") return reply(409, { error: "Review and approve this candidate for import first." });
    const boardId = uuid(body.board_id) ? String(body.board_id) : null;
    const schoolId = uuid(body.school_id) ? String(body.school_id) : null;
    const gradeId = uuid(body.grade_id) ? String(body.grade_id) : null;
    const subject = clip(body.subject_name, 120);
    const year = Number(body.year);
    const examType = clip(body.exam_type, 40);
    const medium = clip(body.medium, 60);
    if ((boardId === null) === (schoolId === null) || !gradeId || !subject || !Number.isInteger(year) || year < 1950 || year > new Date().getFullYear() + 1 || !["main","compartment","supplementary","sample","other"].includes(examType) || !["English","Hindi","Kannada","Sanskrit","Other"].includes(medium)) {
      return reply(400, { error: "Choose exactly one Board or School, Class, Subject, valid Year, Exam Type and Medium." });
    }
    if (candidate.verification_status !== "verified" || !candidate.checksum || !candidate.pdf_url) return reply(400, { error: "Verify this PDF successfully before importing." });
    const { data: duplicate } = await admin.from("qb_source_papers").select("id").eq("checksum", candidate.checksum).maybeSingle();
    if (duplicate) {
      await admin.from("qb_paper_discovery_candidates").update({ status: "duplicate", duplicate_of_paper_id: duplicate.id, updated_at: new Date().toISOString() }).eq("id", candidateId);
      return reply(409, { error: "This PDF already exists in Past Papers.", duplicate_paper_id: duplicate.id });
    }
    const pdf = await fetchCandidatePdf(candidate, domains);
    const bytes = await readBounded(pdf.response);
    if (!isPdf(bytes)) return reply(422, { error: "The PDF content changed after verification. Verify it again." });
    const checksum = await sha256(bytes);
    if (checksum !== candidate.checksum) return reply(409, { error: "The PDF changed after verification. Verify it again." });
    const path = "source-papers/admin/discovery/" + crypto.randomUUID() + ".pdf";
    const upload = await admin.storage.from("qb-papers").upload(path, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, { contentType: "application/pdf", upsert: false });
    if (upload.error) return reply(500, { error: "Could not store the PDF: " + upload.error.message });
    const paper = {
      source_type: schoolId ? "school" : "board", board_id: boardId, school_id: schoolId,
      grade_id: gradeId, subject_name: subject, year, exam_type: examType, medium,
      source_url: candidate.source_url, stored_pdf_url: "qb-papers/" + path,
      pdf_type: "digital", download_date: new Date().toISOString().slice(0, 10),
      extraction_status: "not_started", checksum, uploaded_by: auth.user.id,
      status: "pending_review",
    };
    const { data: inserted, error: insertError } = await admin.from("qb_source_papers").insert(paper).select("id").single();
    if (insertError || !inserted) {
      await admin.storage.from("qb-papers").remove([path]);
      return reply(500, { error: "PDF stored but Past Papers registration failed: " + (insertError?.message || "unknown error") });
    }
    const { error: candidateUpdateError } = await admin.from("qb_paper_discovery_candidates").update({
      status: "imported", imported_paper_id: inserted.id, checksum, file_size_bytes: bytes.length,
      board_id: boardId, school_id: schoolId, grade_id: gradeId, subject_name: subject, year, exam_type: examType, medium,
      reviewed_by: auth.user.id, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", candidateId);
    if (candidateUpdateError) {
      await admin.from("qb_source_papers").delete().eq("id", inserted.id);
      await admin.storage.from("qb-papers").remove([path]);
      return reply(500, { error: "Could not finalize the import; the temporary paper and PDF were rolled back." });
    }
    return reply(200, { imported: true, paper_id: inserted.id, status: "pending_review", message: "Imported into the existing Past Papers review workflow." });
  }

  return reply(400, { error: "Unknown action." });
});
