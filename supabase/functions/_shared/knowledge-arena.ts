import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

export const errorResponse = (status: number, message: string) =>
  json(status, { error: { message } });

export function adminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Supabase server configuration is missing.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function authenticate(req: Request) {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return { error: "Login required.", status: 401 as const };
  const db = adminClient();
  const { data, error } = await db.auth.getUser(jwt);
  if (error || !data.user) return { error: "Invalid login session.", status: 401 as const };
  const { data: profile, error: profileError } = await db
    .from("profiles").select("id, role, linked_student_id").eq("id", data.user.id).maybeSingle();
  if (profileError || !profile?.role) return { error: "LIB profile not found.", status: 403 as const };
  return { db, user: data.user, profile };
}

export async function studentContext(db: SupabaseClient, profile: { linked_student_id: string | null; role: string }) {
  if (profile.role !== "Student" || !profile.linked_student_id) return null;
  const { data: student, error } = await db.from("students")
    .select("id, grade_id").eq("id", profile.linked_student_id).maybeSingle();
  if (error || !student) return null;
  if (!student.grade_id) return { studentId: student.id as string, gradeId: null, gradeLabel: "General" };
  const { data: grade, error: gradeError } = await db.from("grades")
    .select("id, name").eq("id", student.grade_id).maybeSingle();
  // A configured grade that cannot be resolved must fail closed, not silently
  // grant access to the General content band.
  if (gradeError || !grade?.name) return null;
  return { studentId: student.id as string, gradeId: grade.id as number | string, gradeLabel: grade.name as string };
}

export function indiaDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

export function indiaDayStartIso(date: string): string {
  return new Date(date + "T00:00:00+05:30").toISOString();
}

export function validGameType(value: unknown): value is string {
  return ["word_master", "number_quest", "science_explorer", "quick_quiz", "brain_teaser", "memory_challenge"].includes(String(value));
}

export function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
