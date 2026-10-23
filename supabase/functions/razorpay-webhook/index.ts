// razorpay-webhook: Razorpay calls this on every captured payment (Razorpay Dashboard → Webhooks, event payment.captured).
// It checks Razorpay's signature with RAZORPAY_WEBHOOK_SECRET, saves the payment in razorpay_payments (SQL 61)
// and runs razorpay_try_match(), which marks the matching Wix demo booking Paid. Deploy with JWT verification OFF:
// Razorpay sends no Supabase login. The website's own Razorpay webhook is separate and untouched.
import { createClient } from "npm:@supabase/supabase-js@2";

const reply = (status: number, message: string) =>
  new Response(JSON.stringify({ message }), { status, headers: { "Content-Type": "application/json" } });

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
// Same length, every character compared, so the time taken says nothing about the secret.
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, "Use POST.");
  const secret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
  if (!secret) return reply(500, "RAZORPAY_WEBHOOK_SECRET is not set.");

  // The signature is over the exact bytes Razorpay sent, so read the raw text before parsing.
  const raw = await req.text();
  const given = (req.headers.get("x-razorpay-signature") || "").trim().toLowerCase();
  if (!given || !sameText(given, await hmacHex(secret, raw))) return reply(401, "Bad signature.");

  let event: { event?: string; payload?: { payment?: { entity?: Record<string, unknown> } } };
  try { event = JSON.parse(raw); } catch { return reply(400, "Bad JSON."); }
  // Anything other than a captured payment is acknowledged and ignored, so Razorpay does not retry it.
  if (event.event !== "payment.captured") return reply(200, "Ignored: " + (event.event || "unknown event"));
  const p = event.payload?.payment?.entity;
  if (!p || typeof p.id !== "string") return reply(400, "No payment in the message.");

  const contact = String(p.contact || "");
  const digits = contact.replace(/\D/g, "");
  const row = {
    id: p.id,
    amount: Number(p.amount || 0) / 100,                       // Razorpay sends paise
    fee: p.fee == null ? null : Number(p.fee) / 100,
    currency: String(p.currency || ""),
    email: String(p.email || ""),
    contact,
    phone10: digits.length >= 10 ? digits.slice(-10) : "",
    method: String(p.method || ""),
    description: String(p.description || ""),
    notes: p.notes && typeof p.notes === "object" ? p.notes : null,
    captured_at: new Date(Number(p.created_at || 0) * 1000 || Date.now()).toISOString(),
    raw: p,
  };

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // Razorpay may send the same payment more than once; the payment id is the key, so a repeat changes nothing.
  const { error: insErr } = await admin.from("razorpay_payments").upsert(row, { onConflict: "id", ignoreDuplicates: true });
  if (insErr) return reply(500, "Could not save the payment: " + insErr.message);   // 500 → Razorpay retries later
  const { data: status, error: matchErr } = await admin.rpc("razorpay_try_match", { p_payment: p.id });
  if (matchErr) return reply(200, "Saved; matching failed: " + matchErr.message);  // saved, admin can link it by hand
  return reply(200, "Saved: " + status);
});
