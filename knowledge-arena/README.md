# LIB Knowledge Arena

A separate learning-games area for LIB students. It is integrated with the existing My LIB login but keeps its Game XP, progress, achievements and leaderboard separate from attendance rewards.

## Current implementation

- `knowledge-arena.html`: responsive Student and Admin application shell.
- `knowledge-arena.js`: authenticated API client, game sessions, result review, daily challenge, progress, leaderboard, Admin controls and non-persistent preview fallback.
- `knowledge-arena.css` and `knowledge-arena-live.css`: isolated styling.
- `proposed-schema.sql`: isolated Knowledge Arena database design. It is outside `supabase/migrations` and has **not** been applied.
- `BACKEND-CONTRACT.md`: API, security, scoring and worker contract.
- `EDGE-FUNCTIONS.md`: function actions, configuration and controlled rollout.
- `supabase/functions/knowledge-arena/index.ts`: authenticated Student/Admin API.
- `supabase/functions/knowledge-arena-worker/index.ts`: one-job-per-invocation AI generation worker.
- `supabase/functions/_shared/knowledge-arena.ts`: shared authentication and utility functions.
- `student-portal-tabs.js` and `student-portal-tabs.css`: separate My Learning, Fun Zone and Settings navigation.

## Student experience

- Uses the existing My LIB Supabase login session; no second password is required.
- Student access requires the exact LIB `Student` role and a linked student record. Subscription status is not checked.
- Games retrieve published questions through the authenticated API. Answer keys stay server-side.
- Attempts are evaluated server-side. Only aggregate attempt totals are saved; individual selected answers are not stored.
- Game XP is 5 per correct answer, plus 10 for a perfect attempt, capped at 100 Game XP per student per India-local day.
- Progress, achievements and a common pseudonymous leaderboard are API-backed.
- Memory Challenge uses a short recall round: the student studies the prompt for six seconds before answering.
- If the API/schema is not ready, the page clearly enters preview mode with sample questions. Preview scores and XP are never saved.

## Daily challenge

- One common competition group and leaderboard across LIB students.
- A separate ten-question Quick Quiz set is published for each active grade band.
- Questions are selected across available subjects. Exact-grade content is preferred; the General set is used only when a grade has fewer than ten suitable questions.
- The Admin can publish today's challenge manually. The worker also attempts publication on each invocation when Daily Challenge is enabled.
- A scheduled worker invocation is not configured yet, so automatic daily publication will begin only after the controlled deployment and scheduling steps.

## Admin controls

- Aggregate player, game, published-question, accuracy and AI-spend metrics.
- Shared daily and monthly AI budget limits, defaulting to ₹100/day and ₹1,000/month across all students.
- Master controls for games, AI generation and daily challenges.
- Queue generation jobs and pause/resume queued jobs.
- Publish today's daily challenge.
- No student answer history, individual Q&A, or question-level reporting is exposed.
- Existing attendance gamification remains separate. The read-only Admin attendance summary integration is still outstanding.

## AI generation and cost controls

- Anthropic Messages API; provider credentials remain server-side and are read from the existing LIB AI settings.
- Shared INR budget accounting uses the configured USD/INR conversion rate and provider token prices. The worker fails closed if any required price/rate is missing.
- A singleton tokenised database lease with heartbeat prevents concurrent workers from overspending the shared budget.
- A conservative preflight reservation is recorded before paid calls; completed usage is settled and uncertain failures remain reserved for review.
- Generated questions undergo structural checks, duplicate checks and an independent AI validation pass. This is a quality filter, not a guarantee of factual correctness.

## Production status and safety boundaries

The Student/Admin UI and backend source are committed to `feature/knowledge-arena`. The Supabase schema is still design-only. Neither Edge Function is deployed; no production SQL, secrets, schedules or settings have been changed. The feature is not enabled for live student use.

There is no separate test database. The rollout plan is controlled production testing in small steps after code review and an explicit approval for each production operation. This branch does not merge itself.

- Existing LIB Question Bank and Online Assessment are completely outside this feature. No `qb_*` object is read, written, called, extended or modified.
- Existing attendance XP, badges, streaks and leaderboard calculations are unchanged.
- No teacher workflows or unrelated Admin workflows are changed.
- No production migration, Edge Function deployment, secret configuration, schedule creation or student-access activation has occurred.
