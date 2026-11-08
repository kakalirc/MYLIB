# LIB Knowledge Arena — isolated build

The Knowledge Arena is a separate student activity area, entered from **My LIB → Fun Zone**. It is deliberately isolated from the existing Question Bank, Online Assessment and attendance reward calculations.

## Current files
- `knowledge-arena.html`, `knowledge-arena.css`, `knowledge-arena-live.css`, `knowledge-arena.js`: responsive student and Admin screens, Supabase session reuse, authenticated API client, quiz flow, memory recall interaction, Game XP/achievements/leaderboard and Admin controls.
- `proposed-schema.sql`: isolated database design draft. It is **not** in the Supabase migrations directory and has not been applied.
- `BACKEND-CONTRACT.md`: API, scoring, security and AI-worker contract.
- `EDGE-FUNCTIONS.md`: Edge Function actions, configuration, deployment sequence and outstanding rollout gates.
- `supabase/functions/knowledge-arena/index.ts`: isolated Student/Admin API Edge Function.
- `supabase/functions/knowledge-arena-worker/index.ts`: one-job-per-run AI generation worker and scheduled daily-challenge publication action.
- `supabase/functions/_shared/knowledge-arena.ts`: shared server-side authentication and utility functions.
- `student-portal-tabs.js`, `student-portal-tabs.css`: separate My Learning, Fun Zone and Settings navigation in Student Login.

## Current status
The student UI is now wired to the authenticated Knowledge Arena API contract. It reuses the existing Supabase browser session for the same origin and responds to My LIB cross-tab logout. Student requests are authenticated and checked against the exact LIB Student role and linked student record. The Admin view is available only to an authenticated Admin role.

If the Edge Function or isolated schema is not yet deployed, the UI falls back to a clearly labelled sample preview. Preview scores are never submitted or persisted. The live student experience loads published grade-matched questions, submits selected option indexes for server-side evaluation, then refreshes saved Game XP, achievements and the common leaderboard. Correct answers remain server-side until the attempt is submitted.

The Admin screen includes summary-only metrics, master switches for games/generation/daily challenges, individual game and subject availability controls, shared INR budget controls, generation job queue/pause/resume, daily challenge publication and Admin review of unsettled AI cost reservations. It does not show individual questions, selected answers or question-level history.

The schema remains a design artifact only. No production table, policy, function, trigger, setting, secret or schedule has been changed. Neither Edge Function has been deployed. No PR merge or production deployment has occurred.

## Database design and safeguards
The proposed model uses a dedicated `ka_*` namespace for question content, private answer keys, generation jobs, an auditable AI usage ledger, aggregate attempts, grade-specific daily challenges, player statistics, achievements and settings. Individual selected answers are evaluated in trusted server code and are not persisted. Each game attempt has a client-generated idempotency ID, so a retry after a network timeout cannot award duplicate Game XP.

The schema:
- Includes preflight checks for required LIB profile/student/grade/subject structures and refuses to proceed if any `ka_*` object already exists.
- Grants browser roles only the limited read access required by student screens, with RLS; answer keys, jobs, settings and AI usage remain server-only.
- Revokes privileges only on the new `ka_*` tables. It does not change grants on existing LIB tables.
- Uses a token-owned worker lease with renewal/release RPCs so an expired worker cannot clear a newer worker's lease.
- Records preflight AI cost reservations in `ka_ai_usage`; unsettled reservations remain counted against the shared budget for Admin review.
- Publishes exactly ten grade-specific daily questions per active grade only when a full set exists. Students across all grades remain on one common Game XP leaderboard.

The SQL still requires review against the live schema and an explicitly approved production application. Do not apply this draft automatically.

## Game rules
- All LIB student logins are eligible regardless of subscription status.
- Daily challenge: ten English Quick Quiz questions per active grade per India-local day, mixed across available subjects, with unlimited attempts.
- Daily challenge questions use the Quick Quiz game type and mix available subjects. Exact-grade questions are preferred; a complete General set is used when a grade has fewer than ten suitable questions. If neither set has ten questions, that grade's challenge is not published.
- Game XP is separate from attendance XP: 5 XP per correct answer, 10 XP perfect-attempt bonus, and 100 XP daily cap per student.
- Level display uses 100 Game XP per level as the current UI convention.
- Leaderboard is common across all student grades and uses pseudonymous player labels.
- Memory Challenge has a recall mechanic: students study a generated sequence/prompt briefly before answer options appear. Its content is still validated and scored through the server-side MCQ contract.

## Compatibility constraints
- Existing LIB Question Bank and Online Assessment remain completely outside this feature. Do not read, write, extend, or alter any `qb_*` object or exam workflow.
- Attendance XP, levels, badges, streaks and leaderboard calculations remain unchanged. Knowledge Arena Game XP is a separate system.
- Teacher and Parent workflows are unchanged.
- Student Login navigation is implemented in separate JS/CSS files; `index.html` has only the external script reference required to load them.
- Admin reporting is aggregate-only; no student-level attempt drill-down or question-level data is exposed.
- No PR merge, production migration, Edge Function deployment, secret configuration, scheduler or student access activation has occurred.
