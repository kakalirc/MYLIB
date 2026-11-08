# LIB Knowledge Arena — isolated build

This directory is deliberately separate from the existing `index.html`.

## Current files
- `knowledge-arena.html`: responsive student/admin preview shell and sample game UI.
- `knowledge-arena.css`: isolated styles.
- `knowledge-arena.js`: client-side sample quiz flow.
- `proposed-schema.sql`: isolated database design draft. It is **not** in the Supabase migrations directory and must not be applied as-is.
- `BACKEND-CONTRACT.md`: API, scoring, security and AI-worker contract.

## Current status
The front end remains an interactive prototype using sample questions, sample leaderboard rows, and browser-memory XP. It is not connected to LIB authentication, Supabase, student records, attendance gamification, AI question generation, scheduled challenges, or persistent scoring.

The proposed schema is a design artifact only. No database table has been created. No live Supabase object, policy, function, trigger, or setting has been changed.

## Database design
The proposed model uses a dedicated `ka_*` namespace for question content, private answer keys, generation jobs, aggregate attempts, daily challenges, player statistics, achievements and settings. Individual answers are evaluated in trusted server code and are not persisted. This protects the Admin summary-only requirement and reduces sensitive answer-history exposure.

The SQL includes preflight checks and explicit RLS policies, but it still requires review against the complete live schema and confirmation of the exact Student role value, linked student mapping, leaderboard display policy, grade mapping, and game scoring rules. Do not apply this draft to production.

## Compatibility constraints
- Existing LIB Question Bank and Online Assessment remain completely outside the Knowledge Arena design.
- Do not read from, write to, extend, or alter any existing exam/assessment table, function, view, policy, trigger, or workflow.
- Do not alter `index.html`, existing attendance, teacher/admin workflows, or attendance gamification.
- Attendance XP, levels, badges, streaks and leaderboard calculations must be reused as-is for the separate Admin attendance view; do not duplicate their calculation.
- Knowledge Arena Game XP, levels, badges, streaks and leaderboard remain separate.
- All students with a LIB login can access the Arena regardless of subscription status.
- Admin Knowledge Arena reporting is aggregate-only and does not expose questions, answers or question-by-question history.
- No merge, production migration, or deployment is authorised by this branch build.
