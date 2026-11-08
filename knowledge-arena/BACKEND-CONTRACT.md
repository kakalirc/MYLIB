# Knowledge Arena backend contract

Status: implementation code is prepared on `feature/knowledge-arena`; no live backend or database changes have been made.

## Security boundaries

- Authenticate every request using the caller's Supabase JWT.
- Resolve the caller through `profiles.id = auth.uid()`; only the exact LIB Student role with a non-null `linked_student_id` can play. Admin endpoints require the exact Admin role.
- Subscription status is not checked for Knowledge Arena access.
- All score evaluation and XP awards happen server-side. Never accept a client-supplied score, XP total, rank, badge, or streak as authoritative.
- The browser submits question IDs and selected option indexes. The server loads private answer keys, calculates the result, and persists only aggregate attempt data. It must not persist per-question answer history.
- Admin reporting is aggregate-only. Admin endpoints must not return prompt text, answer options, answer keys, per-question correctness, or per-question history.
- Answer-key, generation-job, settings and AI usage tables are service-role-only. The browser receives no service-role credential.
- AI credentials remain server-side. Do not return `ai_settings.api_key` to any browser.
- Do not depend on the existing generic AI proxy for Knowledge Arena generation.

## API actions

1. `get_context`: return only the authenticated Student/Admin role and the Student's resolved grade label.
2. `get_catalog`: return enabled game types, available subjects and the student's own Game XP summary.
3. `get_questions`: return published questions matching the authenticated student's grade, selected subject/game and optional difficulty. Return prompt/options only; never return answer keys.
4. `get_daily_challenge`: return the current India-local date's ten-question challenge for the student's grade, or a paused/not-ready response.
5. `submit_attempt`: accept question IDs, selected option indexes, game type and optional challenge ID. Validate every question and challenge membership; calculate score on the server; award XP under the approved policy; store only aggregate totals; update player stats and achievements. Daily challenges may mix subjects and game types but are one grade-specific challenge.
6. `get_my_progress`: return only the caller's aggregate stats and unlocked/locked achievement catalogue.
7. `get_leaderboard`: return the common student leaderboard with pseudonymous display labels and Game XP.
8. `get_admin_summary`: Admin-only aggregate metrics, budget usage and settings. No student-level attempt drill-down or question-level data.
9. `get_admin_options` / `get_admin_jobs`: Admin-only grade/subject choices and non-content generation job status.
10. `admin_control`: Admin-only switches, shared INR budgets, disabled game/subject lists, generation queue/pause/resume and daily challenge publication.

## AI generation worker

- Processes one queued batch per invocation; a scheduled invocation can also publish the current day's challenges.
- Reads only Knowledge Arena configuration and writes only `ka_*` objects, plus reads the existing server-side `ai_settings.api_key` without exposing it.
- Generates batches by subject, grade, language, game type and difficulty.
- Requires structured output; rejects malformed questions, invalid option counts, missing explanations, unsupported answer indexes, duplicates, mismatched grade/game metadata and unsuitable content.
- Runs independent validation and deduplication before publishing.
- Inserts question prompts/options and private answer indexes in one transaction.
- Enforces shared India-local AI budgets across all students: ₹100/day and ₹1,000/month by default, configurable by Admin. A token-owned singleton lease is renewed while a worker is active.
- Records each batch's conservative preflight reservation and settled actual cost in `ka_ai_usage`. An interrupted or uncertain provider call leaves a reservation in review and continues to count against the budget until Admin review.
- Never reads from or writes to any exam/assessment data.

## Approved defaults and product behaviour

- Daily challenge: ten questions per active grade per India-local day; mixed subjects; all students share the same overall Game XP leaderboard. A grade is skipped unless ten suitable published questions are available.
- Game XP: 5 per correct answer, 10 perfect-attempt bonus, 100 XP/student/India-local day cap.
- Memory Challenge: a recall-first interaction using a generated sequence/prompt before options are revealed.
- Level display: current UI convention is 100 Game XP per level.
- Leaderboard labels remain pseudonymous.
- Unlimited attempts; only aggregate attempts are retained.

## Rollout gates

The UI and API client are connected in the feature branch, but live functionality requires the reviewed schema and Edge Functions to be deployed. The SQL draft remains outside `supabase/migrations`. No production schema, secrets, function deployment, schedule or student activation has been performed.
