// Admin-only online Past Paper discovery.
// Pre-Search is PDF-only; newly discovered direct-PDF domains receive candidate-scoped verification,
// while permanent source-registry changes remain explicit Admin actions. Imports use the existing workflow.
import { createClient } from "npm:@supabase/supabase-js@2";
import { getPdfZipMember, listPdfMembersFromZip } from "./archive.ts";
import { matchesApprovedSourceDomain } from "./source-domain.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const MAX_PDF_BYTES = 50 * 1024 * 1024;
const uuid = (v: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v ?? ""));

function safeHost(url: URL, domains: string[]): boolean {
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")
      || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return false;
  return domains.some((d) => host === d || host.endsWith("." + d));
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
async function searchBingRss(query: string, limit = 20, domain?: string) {
  const targeted = domain ? query + " site:" + domain : query;
  const res = await fetch("https://www.bing.com/search?format=rss&q=" + encodeURIComponent(targeted), {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; LIBEducationPastPaperDiscovery/1.0)",
      "Accept": "application/rss+xml, application/xml, text/xml",
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error("Bing RSS returned HTTP " + res.status + ".");
  const xml = new TextDecoder().decode(await readBounded(res, 2 * 1024 * 1024));
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
async function searchWeb(query: string, limit = 20, domain?: string) {
  const targeted = domain ? query + " site:" + domain : query;
  try {
    const res = await fetch("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(targeted), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error("DuckDuckGo returned HTTP " + res.status + ".");
    const html = new TextDecoder().decode(await readBounded(res, 2 * 1024 * 1024));
    const rows = parseSearchResults(html, limit).filter((row) => !domain || row.domain === domain || row.domain.endsWith("." + domain));
    if (rows.length) return rows;
    return await searchBingRss(query, limit, domain);
  } catch (ddgError) {
    try { return await searchBingRss(query, limit, domain); }
    catch (bingError) {
      throw new Error("DuckDuckGo: " + clip((ddgError as Error)?.message || ddgError, 180)
        + " · Bing: " + clip((bingError as Error)?.message || bingError, 180));
    }
  }
}
async function searchInBatches(sources: any[], query: string, batchSize = 4) {
  const results: Array<{ title: string; url: string; snippet: string; domain: string; source: any; archive_member?: string }> = [];
  const errors: string[] = [];
  let successfulQueries = 0;
  for (let i = 0; i < sources.length; i += batchSize) {
    const batch = sources.slice(i, i + batchSize);
    const settled = await Promise.all(batch.map(async (source: any) => {
      try {
        const variants = [
          query + " question paper filetype:pdf",
          query + " previous year examination paper filetype:pdf",
          query + " annual exam question paper filetype:pdf",
        ];
        const attempts = await Promise.all(variants.map(async (variant) => {
          try { return { rows: await searchWeb(variant, 8, source.domain), error: "" }; }
          catch (e) { return { rows: [], error: clip((e as Error)?.message || e, 180) }; }
        }));
        const successful = attempts.filter((x) => !x.error);
        const failed = attempts.filter((x) => x.error);
        if (!successful.length) throw new Error(failed.map((x) => x.error).join(" · "));
        return { source, rows: successful.flatMap((x) => x.rows), successfulQueries: successful.length,
          error: failed.length ? source.domain + ": Partial provider failures: " + failed.map((x) => x.error).join(" · ") : "" };
      } catch (e) {
        return { source, rows: [], error: source.domain + ": " + clip((e as Error)?.message || e, 220) };
      }
    }));
    for (const item of settled) {
      if (item.error) errors.push(item.error);
      successfulQueries += Number((item as any).successfulQueries || (!item.error ? 1 : 0));
      for (const row of item.rows) results.push({ ...row, source: item.source });
    }
  }
  return { results, errors, successfulQueries };
}
async function fetchAllowed(urlText: string, domains: string[], accept: string) {
  let url: URL;
  try { url = new URL(urlText); } catch { throw new Error("Invalid URL."); }
  for (let hop = 0; hop <= 5; hop++) {
    if (!safeHost(url, domains)) throw new Error("URL or redirect is outside the approved source domains.");
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
type DiscoveryRow = {title:string;url:string;snippet:string;domain:string;source:any};
function queryTerms(query: string): string[] {
  return query.toLowerCase().replace(/\b(cbse|cisce|icse|isc|question papers?|previous year|past papers?|sample papers?|specimen|pdf|class|grade)\b/g, " ")
    .replace(/\b(x|xii|10|12)\b/g, " ").split(/[^a-z0-9]+/).filter((x) => x.length > 1);
}
function matchesQuery(label: string, terms: string[]): boolean {
  const value = label.toLowerCase();
  return !terms.length || terms.some((term) => value.includes(term));
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
    if (!matchesQuery(label + " " + context + " " + target.pathname, terms)) continue;
    // Web pages are discovery evidence only. A candidate must point to an actual PDF.
    if (!isPdf) continue;
    rows.push({ title: (label || target.pathname.split("/").pop() || source.display_name).slice(0, 500),
      url: target.href, snippet: "Official source page · " + source.display_name + (context ? " · " + context.slice(0, 260) : ""),
      domain: target.hostname.toLowerCase().replace(/^www\./, ""), source });
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
function isQuestionPaperPdf(row: any, query: string): boolean {
  if (row.archive_member) return true;
  if (!String(row.url || "").toLowerCase().includes(".pdf")) return false;
  const evidence = [row.title, row.snippet, row.url].join(" ").toLowerCase();
  const paperSignal = [
    "question paper", "question-paper", "question_paper", "sample paper", "sample-paper",
    "specimen paper", "specimen-paper", "past paper", "previous year", "annual exam",
    "annual examination", "exam paper", "board paper",
  ].some((signal) => evidence.includes(signal));
  return paperSignal && matchesQuery(evidence, queryTerms(query));
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
    const html = await result.response.text();
    const links = [...html.matchAll(/(?:href|data-url)\s*=\s*["']([^"']+\.pdf(?:\?[^"']*)?)["']/gi)].map((m) => new URL(decodeEntities(m[1]), result.url).href);
    for (const link of links) {
      const u = new URL(link);
      if (safeHost(u, domains)) {
        const pdf = await fetchAllowed(u.href, domains, "application/pdf,application/octet-stream");
        return pdf;
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
        const resetFilters = { ...existing.filters, source_snapshot: null, discovery_progress: {
          next_offset: 0, successful_queries: 0, provider_errors: [],
          results_found: preservedCount, new_candidates: 0,
          previously_seen_pdf_urls: 0, discovered_source_count: 0,
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
    const searchTargets = scope === "school"
      ? eligible.filter((s: any) => s.source_type === "school")
      : eligible.filter((s: any) => s.source_type === "board" || s.source_type === "education_portal");
    // Broad PDF search still runs when no registry entries are enabled. A disabled
    // registry domain is never silently re-enabled or reintroduced by broad search.

    const progress = run.filters?.discovery_progress || {};
    const offset = Math.max(0, Number(progress.next_offset) || 0);
    const batch = searchTargets.slice(offset, offset + 1);
    const providerErrors: string[] = Array.isArray(progress.provider_errors) ? progress.provider_errors.slice(0, 80) : [];
    let successfulQueries = Math.max(0, Number(progress.successful_queries) || 0);
    let foundTotal = Math.max(0, Number(progress.results_found) || 0);
    let insertedTotal = Math.max(0, Number(progress.new_candidates) || 0);
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
      const broadQueries = [
        query + " previous year board examination question paper filetype:pdf",
        query + " annual examination question paper filetype:pdf",
        query + " past exam question paper filetype:pdf",
        query + " sample question paper filetype:pdf",
      ];
      const broadSettled = await Promise.all(broadQueries.map(async (broadQuery) => {
        try { return { rows: await searchWeb(broadQuery, 20), error: "" }; }
        catch (e) { return { rows: [], error: clip((e as Error)?.message || e, 300) }; }
      }));
      for (let i = 0; i < broadSettled.length; i++) {
        const item = broadSettled[i];
        if (item.error) providerErrors.push("Broad web search (" + (i + 1) + "): " + item.error);
        else successfulQueries++;
        broadResults.push(...item.rows);
      }
    }
    const allRows = [...batchRows, ...broadResults.map((r) => {
      const matched = registry.find((s: any) => s.enabled &&
        (r.domain === s.domain || r.domain.endsWith("." + s.domain)));
      const disabled = registry.find((s: any) => !s.enabled &&
        (r.domain === s.domain || r.domain.endsWith("." + s.domain)));
      return { ...r, source: matched || null, disabledSource: disabled || null };
    })];
    const disabledRows = allRows.filter((row) => row.disabledSource);
    const rows = allRows.filter((row) => !row.disabledSource);
    const unique = new Map<string, any>();
    for (const row of rows) if (!unique.has(String(row.url).toLowerCase())) unique.set(String(row.url).toLowerCase(), row);
    // Search providers may ignore filetype operators. Never create a paper candidate
    // from an ordinary HTML result: only direct PDF URLs and verified PDF members qualify.
    const flattened = [...unique.values()].filter((r) => isQuestionPaperPdf(r, query));
    const inserts = flattened.slice(0, 80).map((r) => ({
      discovery_run_id: runId, source_id: r.source?.id || null, source_type: scope,
      source_domain: r.domain, title: r.title, source_url: r.url,
      pdf_url: r.archive_member || /\.pdf(?:$|[?#])/i.test(r.url) ? r.url : null,
      discovered_school_name: scope === "school" ? schoolName || null : null,
      discovery_metadata: {
        snippet: r.snippet, archive_member: r.archive_member || null,
        marking_scheme_url: r.marking_scheme_url || null,
        trust_level: r.source?.trust_level || "unverified",
        source_name: r.source?.display_name || r.domain,
        source_match: r.source ? "approved_registry" : "unregistered_domain",
        search_provider: r.snippet.startsWith("Bing RSS search") ? "Bing RSS" : r.snippet.startsWith("Official CBSE") ? "CBSE official archive crawler"
          : r.snippet.startsWith("Official CISCE") ? "CISCE official media crawler"
          : r.snippet.startsWith("Official source page") ? (r.source?.source_type === "education_portal" ? "Registered education portal crawler" : "Registered school website crawler") : "DuckDuckGo HTML",
        search_method: r.source ? "targeted_domain" : "broad_web",
      },
    }));
    let inserted = 0;
    if (inserts.length) {
      const { data, error } = await admin.from("qb_paper_discovery_candidates")
        .upsert(inserts, { onConflict: "source_url", ignoreDuplicates: true }).select("id");
      if (error) {
        await admin.from("qb_paper_discovery_runs").update({ status: "failed", heartbeat_at: null,
          error_message: "Could not save search results: " + error.message, completed_at: new Date().toISOString() }).eq("id", runId);
        return reply(500, { error: "Could not save search results: " + error.message });
      }
      inserted = data?.length || 0;
    }
    // Link both new and previously known URLs to this run without changing the
    // candidate's original discovery_run_id or its historical provenance.
    const candidateUrls = flattened.slice(0, 80).map((row) => String(row.url));
    if (candidateUrls.length) {
      const { data: runCandidates, error: runCandidateError } = await admin.from("qb_paper_discovery_candidates")
        .select("id,source_url").in("source_url", candidateUrls);
      if (runCandidateError) return reply(500, { error: "PDF candidates were saved, but run membership could not be loaded: " + runCandidateError.message });
      const links = (runCandidates || []).map((candidate: any) => ({ discovery_run_id: runId, candidate_id: candidate.id }));
      if (links.length) {
        const { error: linkError } = await admin.from("qb_paper_discovery_run_candidates")
          .upsert(links, { onConflict: "discovery_run_id,candidate_id", ignoreDuplicates: true });
        if (linkError) return reply(500, { error: "PDF candidates were saved, but run membership could not be recorded: " + linkError.message });
      }
    }
    // Preserve one audit row per checked source attempt, including zero-result and failed checks.
    const sourceAuditRows: any[] = batch.map((source: any) => {
      const matching = batchRows.filter((row: any) => row.source?.id === source.id &&
        (!!row.archive_member || /\.pdf(?:$|[?#])/i.test(String(row.url || ""))));
      const sourceError = providerErrors.find((message) => message.startsWith(source.domain + ":"));
      const partialError = sourceError;
      return {
        discovery_run_id: runId, source_id: source.id, domain: source.domain,
        display_name: source.display_name, source_type: source.source_type,
        source_classification: "approved",
        outcome: matching.length ? "pdf_found" : (sourceError
          ? (/Source returned HTTP|Too many redirects|timed out|Source returned an invalid redirect/i.test(sourceError) ? "inaccessible" : "provider_error")
          : "no_matching_pdf"),
        pdf_count: matching.length,
        provider: "DuckDuckGo/Bing RSS + source-specific crawler",
        evidence: {
          query_variants: [
            query + " question paper filetype:pdf",
            query + " previous year examination paper filetype:pdf",
            query + " annual exam question paper filetype:pdf",
          ],
          result_titles: matching.slice(0, 12).map((row: any) => row.title),
          diagnostic: partialError || null,
        },
      };
    });
    const discoveredCounts = new Map<string, any[]>();
    for (const row of flattened) {
      const registered = registry.some((source: any) => row.domain === source.domain || row.domain.endsWith("." + source.domain));
      if (!registered) {
        const list = discoveredCounts.get(row.domain) || [];
        list.push(row); discoveredCounts.set(row.domain, list);
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
      sourceAuditRows.push({
        discovery_run_id: runId, source_id: source.id, domain, display_name: source.display_name,
        source_type: source.source_type, source_classification: "approved",
        outcome: "disabled_registry", pdf_count: foundRows.length, provider: "Broad web PDF search",
        evidence: { note: "A PDF result was found, but this domain is permanently disabled in the source registry.",
          pdf_urls: foundRows.slice(0, 12).map((row: any) => row.url) },
      });
    }
    for (const [domain, foundRows] of discoveredCounts) {
      sourceAuditRows.push({
        discovery_run_id: runId, source_id: null, domain, display_name: domain,
        source_type: scope === "school" ? "school" : "education_portal",
        source_classification: "discovered", outcome: "pdf_found", pdf_count: foundRows.length,
        provider: "Broad web PDF search",
        evidence: { result_titles: foundRows.slice(0, 12).map((row: any) => row.title),
          pdf_urls: foundRows.slice(0, 12).map((row: any) => row.url) },
      });
    }
    if (sourceAuditRows.length) {
      const { error: auditError } = await admin.from("qb_paper_discovery_run_sources").insert(sourceAuditRows);
      if (auditError) providerErrors.push("Source audit could not be saved: " + auditError.message);
    }

    foundTotal += flattened.length;
    insertedTotal += inserted;
    const previouslySeenTotal = Math.max(0, Number(progress.previously_seen_pdf_urls) || 0)
      + Math.max(0, Math.min(flattened.length, 80) - inserted);
    const discoveredSourceTotal = Math.max(0, Number(progress.discovered_source_count) || 0) + discoveredCounts.size;
    const nextProgress = { next_offset: nextOffset, successful_queries: successfulQueries,
      provider_errors: providerErrors.slice(0, 80), results_found: foundTotal, new_candidates: insertedTotal,
      previously_seen_pdf_urls: previouslySeenTotal, discovered_source_count: discoveredSourceTotal };
    const update: any = { filters: { ...run.filters, discovery_progress: nextProgress },
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
      found: foundTotal, pdfs_found: foundTotal, new_candidates: insertedTotal,
      estimated_new_candidates: insertedTotal,
      previously_seen_pdf_urls: previouslySeenTotal,
      approved_source_results: flattened.filter((r) => r.source).length,
      discovered_source_count: discoveredSourceTotal,
      provider: "Official board archive + DuckDuckGo fallback",
      provider_successful_queries: successfulQueries, provider_errors: providerErrors.slice(-8),
      message: complete
        ? (providerErrors.length ? "Search completed with partial provider failures. Review provider diagnostics before concluding no papers exist." : "Search completed. Review candidates before importing.")
        : "Batch saved. Continuing discovery with the next registered source.",
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
  const validDiscoveredDomain = /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(discoveredDomain);
  const hasDirectPdfEvidence = !!candidate.discovery_metadata?.source_match &&
    candidate.discovery_metadata.source_match === "unregistered_domain" &&
    (/\.pdf(?:$|[?#])/i.test(String(candidate.pdf_url || candidate.source_url || "")) ||
      !!candidate.discovery_metadata?.archive_member);
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
