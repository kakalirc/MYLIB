// ai-proxy: the app's everyday AI calls (help bot, student chat, study plan helpers, summaries).
// The browser sends the prompt; this function adds the Anthropic key from ai_settings (row 1) with service_role,
// so no login ever sees the key (SQL 48 locks ai_settings to admins). Every call is logged in ai_usage_log (SQL 46).
import { createClient } from "npm:@supabase/supabase-js@2";

const MODEL = "claude-haiku-4-5";
const MAX_TOKENS = 1500;          // highest max_tokens a call may ask for
const MAX_PROMPT_CHARS = 40000;   // system + messages, all together
const DAILY_LIMIT = 200;          // calls per login per 24 hours (admins have no limit)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
// Errors use the same shape as Anthropic's ({ error: { message } }), which the app already reads.
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const fail = (status: number, message: string) => reply(status, { error: { message } });

type Msg = { role: string; content: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail(405, "Use POST.");

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) return fail(401, "Not logged in.");
  const userId = userData.user.id;

  const { data: prof } = await admin.from("profiles").select("role, linked_teacher_id").eq("id", userId).maybeSingle();
  if (!prof?.role) return fail(403, "Not allowed.");

  const { data: ai } = await admin.from("ai_settings").select("api_key, master_enabled").eq("id", 1).maybeSingle();
  if (!ai?.api_key || ai.master_enabled === false) return fail(400, "AI is not set up. Ask your admin to add an AI API key in AI Settings.");
  // Per-role and per-person switches (SQL 51). Before SQL 51 the function is missing and everyone stays allowed.
  const { data: allowed } = await admin.rpc("ai_allowed_for", { p_user: userId });
  if (allowed === false) return fail(403, "AI is switched off for you. Ask your admin.");

  if (prof.role !== "Admin") {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count } = await admin.from("ai_usage_log").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since);
    if ((count || 0) >= DAILY_LIMIT) return fail(429, "You have used today's AI limit. Please try again tomorrow.");
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail(400, "Bad request."); }
  const feature = String(body.feature || "other").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "other";
  const system = typeof body.system === "string" ? body.system : undefined;
  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m: Msg) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m: Msg) => ({ role: m.role, content: m.content }));
  if (!messages.length) return fail(400, "Nothing to ask.");
  const size = (system || "").length + messages.reduce((n: number, m: Msg) => n + m.content.length, 0);
  if (size > MAX_PROMPT_CHARS) return fail(413, "That request is too long.");
  const maxTokens = Math.min(MAX_TOKENS, Math.max(1, Number(body.max_tokens) || 500));

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ai.api_key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, ...(system ? { system } : {}), messages }),
    });
    const d = await r.json();
    // Usage log for Admin → Users → AI usage. A failed log never blocks the answer.
    await admin.from("ai_usage_log").insert({
      user_id: userId, role: prof.role, teacher_id: prof.linked_teacher_id || null, feature, model: MODEL,
      input_tokens: d.usage?.input_tokens || 0, output_tokens: d.usage?.output_tokens || 0, ok: r.ok && !d.error,
    }).then(() => {}, () => {});
    if (!r.ok || d.error) return fail(r.ok ? 502 : r.status, d.error?.message || "The AI service did not answer.");
    // Only the text goes back; the app reads content[0].text as before.
    const text = (d.content || []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n");
    return reply(200, { content: [{ type: "text", text }] });
  } catch (e) {
    return fail(502, "Could not reach the AI service: " + (e as Error).message);
  }
});
