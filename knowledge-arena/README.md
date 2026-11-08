# LIB Knowledge Arena — isolated build

This directory is deliberately separate from the existing `index.html`.

## Current files
- `knowledge-arena.html`: responsive student/admin preview shell and sample game UI.
- `knowledge-arena.css`: isolated styles.
- `knowledge-arena.js`: client-side sample quiz flow.
- `proposed-schema.sql`: isolated database design draft. It is **not** in the Supabase migrations directory and must not be applied as-is.
- `BACKEND-CONTRACT.md`: API, scoring, security and AI-worker contract.
- `EDGE-FUNCTIONS.md`: Edge Function actions, configuration, deployment sequence and known blockers.
- `supabase/functions/knowledge-arena/index.ts`: isolated student/Admin API Edge Function.
- `supabase/functions/knowledge-arena-worker/index.ts`: one-job-per-run AI MCQ generation worker.
- `supabase/functions/_shared/knowledge-arena.ts`: shared server-side authentication and utility functions.

## Current status
The front end remains an interactive prototype using sample questions, sample leaderboard rows, and browser-memory XP. It is not connected to LIB authentication, Supabase, student records, attendance gamification, AI question generation, scheduled challenges, or persistent scoring.

The proposed schema is a design artifact only. No database table has been created. No live Supabase object, policy, function, trigger, or setting has been changed.

The API and worker source code is now committed, but neither Edge Function has been deployed. No secrets have been configured and no schedule has been created. The API is not yet connected to the front-end prototype. See `EDGE-FUNCTIONS.md` for required configuration, deployment sequence, and the remaining product decisions.

## Database design
The proposed model uses a dedicated `ka_*` namespace for question content, private answer keys, generation jobs, aggregate attempts, daily challenges, player statistics, achievements and settings. Individual answers are evaluated in trusted server code and are not persisted. This protects the Admin summary-only requirement and reduces sensitive answer-history exposure.

The SQL includes preflight checks and explicit RLS policies, but it still requires review against the complete live schema and confirmation of the exact Student role value, linked student mapping, leaderboard display policy, grade mapping, and game scoring rules. Do not apply this draft to production.

## Current backend scope and limitations
- Student API supports catalog, grade-filtered MCQ retrieval, attempt submission with server-side answer checking, aggregate progress, pseudonymous leaderboard, summary-only Admin reporting and Admin controls.
- Attempt storage contains only aggregate counts and XP; individual selected answers are not persisted.
- The generation worker processes one queued batch per invocation, checks budgets, uses server-side AI credentials and applies structural, duplicate and second-pass AI validation.
- XP settings must be configured after the XP policy is approved; attempt submission fails closed until then.
- Daily challenge retrieval exists, but automatic daily challenge creation is blocked pending challenge length, subject mix and grade-band fairness decisions.
- The first generation pipeline uses MCQ content for all listed game categories; the distinct Memory Challenge interaction is not yet implemented.
- Leaderboard display is pseudonymous until the display-name policy is approved.

## Compatibility constraints
- Existing LIB Question Bank and Online Assessment remain completely outside the Knowledge Arena design.
- Do not read from, write to, extend, or alter any existing exam/assessment table, function, view, policy, trigger, or workflow.
- Do not alter `index.html`, existing attendance, teacher/admin workflows, or attendance gamification.
- Attendance XP, levels, badges, streaks and leaderboard calculations must be reused as-is for the separate Admin attendance view; do not duplicate their calculation.
- Knowledge Arena Game XP, levels, badges, streaks and leaderboard remain separate.
- All students with a LIB login can access the Arena regardless of subscription status.
- Admin Knowledge Arena reporting is aggregate-only and does not expose questions, answers or question-by-question history.
- No merge, production migration, or deployment is authorised by this branch build.
