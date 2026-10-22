// teacher-research: writes a lesson-prep brief for the Research tab.
// The Anthropic key is read here with service_role (ai_settings row 1), so the teacher's browser never sees it.
// Every call is logged in ai_usage_log (SQL 46). Only Admins and Teachers switched on in Admin → Setup → Research access (teachers.ai_research, SQL 46) may call it.
import { createClient } from "npm:@supabase/supabase-js@2";

const MODEL = "claude-sonnet-5-5";
const MAX_TOKENS = 3000;
const DAILY_LIMIT = 30;          // briefs per teacher per 24 hours (admins have no limit)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const SYSTEM = `You help a tutor at My LIB, a tutoring centre in India, prepare one lesson.
Write a short, practical brief the tutor can read in five minutes before class. Use these sections, as Markdown "##" headings:
## Key points
## How to teach it (a simple step-by-step order for the class, with timings that fit about 45 minutes)
## Common mistakes
## Examples
## Practice questions (5 to 8, mixing easy and harder, in the style of the student's board exam, with short answers at the end)
## Quick check (3 questions to ask at the end of class)
Keep it to the chapter and class given. Use simple English. For Sanskrit, Hindi or other Indian languages, write those words in Devanagari.
If you are not sure what the chapter contains in the current textbook, say so in one line at the top instead of guessing, and keep the brief general.`;

const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply(405, { error: "Use POST." });

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) return reply(401, { error: "Not logged in." });

  const { data: prof } = await admin.from("profiles").select("role, linked_teacher_id").eq("id", userData.user.id).maybeSingle();
  if (!prof || !["Admin", "Teacher"].includes(prof.role)) return reply(403, { error: "Not allowed." });
  if (prof.role === "Teacher") {
    const { data: t } = await admin.from("teachers").select("ai_research").eq("id", prof.linked_teacher_id).maybeSingle();
    if (!t?.ai_research) return reply(403, { error: "Research is not switched on for you. Ask your admin." });
  }

  const { data: ai } = await admin.from("ai_settings").select("api_key, master_enabled").eq("id", 1).maybeSingle();
  if (!ai?.api_key || ai.master_enabled === false) return reply(400, { error: "AI is not set up. Ask your admin to add an AI API key in AI Settings." });
  // Per-role and per-person AI switches (SQL 51). Before SQL 51 the function is missing and everyone stays allowed.
  const { data: allowed } = await admin.rpc("ai_allowed_for", { p_user: userData.user.id });
  if (allowed === false) return reply(403, { error: "AI is switched off for you. Ask your admin." });
  if (prof.role !== "Admin") {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count } = await admin.from("ai_usage_log").select("id", { count: "exact", head: true })
      .eq("user_id", userData.user.id).eq("feature", "research").gte("created_at", since);
    if ((count || 0) >= DAILY_LIMIT) return reply(429, { error: `You have made ${DAILY_LIMIT} briefs in the last 24 hours. Please try again tomorrow.` });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply(400, { error: "Bad request." }); }
  const subject = clip(body.subject, 80), grade = clip(body.grade, 40), board = clip(body.board, 40);
  const chapter = clip(body.chapter, 200), focus = clip(body.focus, 600);
  if (!subject || !chapter) return reply(400, { error: "Pick a subject and a chapter." });

  const ask = [
    `Subject: ${subject}`,
    grade && `Class: ${grade}`,
    board && `Board: ${board}`,
    `Chapter or topic: ${chapter}`,
    focus && `The tutor also says: ${focus}`,
  ].filter(Boolean).join("\n");

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ai.api_key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system: SYSTEM, messages: [{ role: "user", content: ask }] }),
    });
    const d = await r.json();
    // Usage log for Admin → Setup → AI usage. A failed log never blocks the brief.
    await admin.from("ai_usage_log").insert({
      user_id: userData.user.id, role: prof.role, teacher_id: prof.linked_teacher_id || null, feature: "research", model: MODEL,
      input_tokens: d.usage?.input_tokens || 0, output_tokens: d.usage?.output_tokens || 0, ok: r.ok && !d.error,
    }).then(() => {}, () => {});
    if (!r.ok || d.error) return reply(502, { error: d.error?.message || "The AI service did not answer." });
    const text = (d.content || []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n").trim();
    return reply(200, { text });
  } catch (e) {
    return reply(502, { error: "Could not reach the AI service: " + (e as Error).message });
  }
});
