# Knowledge Arena Edge Functions — deployment and API notes

**Status:** Student/Admin UI and function source are committed to `feature/knowledge-arena`; neither Edge Function is deployed. The proposed SQL remains design-only. No production secrets, schedules or settings have been changed.

## Functions

### `knowledge-arena`

POST JSON API. Every request requires the caller's valid Supabase user JWT.

- `get_context` — returns the authenticated caller's LIB role and, for Students, grade band.
- `get_catalog` — enabled games, available subjects, grade band and the student's own progress summary.
- `get_questions` — published MCQs for the authenticated student's grade band, selected subject and game. Answer keys are never returned.
- `get_daily_challenge` — returns today's published ten-question set for the student's grade band.
- `submit_attempt` — loads private answer keys server-side, evaluates answers, applies XP policy and stores aggregate totals only.
- `get_my_progress` — own aggregate stats and unlocked/locked achievement list.
- `get_leaderboard` — common all-student Game XP leaderboard with pseudonymous labels.
- `get_admin_summary` — Admin-only aggregate metrics and shared AI usage.
- `get_admin_options` — Admin-only grade and subject options for generation jobs.
- `get_admin_jobs` — Admin-only operational job metadata, without question or answer content.
- `admin_control` — Admin-only master switches, INR budgets, generation queue/pause/resume and manual daily-challenge publication.

Student access checks exact role `Student` and a linked student record. Subscription status is not checked. Students with no configured grade use the General content band.

### `knowledge-arena-worker`

One generation job per invocation. It:

1. Requires the separate `x-ka-worker-secret`.
2. If Daily Challenge is enabled, attempts to publish today's grade-specific ten-question Quick Quiz sets from already-published questions. This happens independently of AI generation.
3. If AI generation is disabled, exits without making a paid AI call.
4. Acquires a singleton tokenised worker lease and renews it every 45 seconds.
5. Checks shared India-local daily/monthly INR usage and reserves a conservative estimate before any provider call.
6. Reads the Anthropic API key server-side from the existing `ai_settings` row using the service role. It does not call or modify the existing `ai-proxy`.
7. Generates evergreen MCQs, validates structure and duplicates, then runs a second AI quality check.
8. Publishes question content and private answer key atomically through `ka_store_generated_question()`.
9. Settles usage after success. Uncertain failures retain a budget reservation and are marked for review.

The second AI pass is a quality filter, not a guarantee of factual correctness. The initial generator avoids current affairs and other time-sensitive facts.

## Required server-side configuration

Existing Supabase Edge Function environment:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Knowledge Arena:
- `KA_WORKER_SECRET` — long random secret for the worker endpoint.
- `KA_INPUT_USD_PER_MILLION` — current provider input-token price for the selected model.
- `KA_OUTPUT_USD_PER_MILLION` — current provider output-token price for the selected model.
- `KA_USD_INR_RATE` — current USD/INR rate. Record the rate used for each reservation.
- `KA_ANTHROPIC_MODEL` — optional; defaults to `claude-haiku-4-5`.
- `KA_XP_PER_CORRECT` — optional; defaults to 5.
- `KA_PERFECT_ATTEMPT_BONUS` — optional; defaults to 10.
- `KA_DAILY_XP_CAP` — optional; defaults to 100 XP per Student per India-local day.

The worker fails closed when token prices or the FX rate are missing or invalid. Never place provider or service-role secrets in browser code.

## Daily challenge publication

The design RPC `ka_publish_daily_challenges(date)`:
- Uses only published `quick_quiz` questions.
- Creates one challenge per active grade band, with ten questions chosen across available subjects.
- Uses the exact grade's content when ten questions are available; otherwise uses ten General questions as the fallback.
- Keeps a single common competition group and Game XP leaderboard across grades.
- Does not publish a partial challenge for a grade that lacks ten suitable questions.
- Is callable by Admin through the API and is also attempted by the worker whenever the daily-challenge switch is enabled.

The Admin can manually publish today's challenge. For automatic daily publication, the worker must be deployed and scheduled. No schedule exists yet.

## Controlled production rollout — not performed

There is no separate test database. The agreed path is controlled testing on production in small, isolated steps after code review. No step below is performed by this branch update.

1. Reconcile the branch with current `main`; review the complete diff and CI. Do not merge automatically.
2. Take/verify a current production backup and recheck the live schema, role labels, grade mapping, grants and RLS. Confirm no `ka_*` objects already exist.
3. Review and explicitly approve `knowledge-arena/proposed-schema.sql`; apply only the isolated `ka_*` objects with generation and daily challenges disabled. Stop on any preflight mismatch.
4. Verify the created objects, RLS, grants, RPC privileges and protected-system boundary.
5. Configure the server-side worker secret, current provider token prices and current USD/INR rate.
6. Deploy the API and worker with AI generation disabled. Verify Student, Admin, Teacher and unauthenticated access.
7. Run a small generation pilot under the approved shared budgets; review question quality and actual cost.
8. Test attempts, private answer-key isolation, aggregate-only Admin reporting, XP cap, leaderboard and grade-specific daily challenge.
9. Create a worker schedule only after the pilot and operational controls are accepted. Confirm daily publication and budget-stop behaviour before enabling broader student access.

Production SQL, secrets, Edge Function deployment, scheduling and student enablement require a separate explicit approval at the time of execution.

## Remaining work

- The read-only Admin integration with existing attendance-gamification metrics is not yet implemented.
- Leaderboard is all-time Game XP only; weekly/monthly leaderboards are not implemented.
- Pseudonymous rank labels are used; public student display names are not exposed.
- The six game categories use MCQ question records. Memory Challenge has a recall-style front-end mechanic, but its generated content is still stored as MCQs.
- Daily automation is code-ready but waits for the worker deployment and schedule.
- Preview mode is non-persistent and must not be confused with live scoring.

## Protected-system boundary

Knowledge Arena code and schema do not read from, write to, call, or alter any `qb_*` table, function, view, policy, trigger or assessment workflow. The existing `ai-proxy` and attendance calculations are not modified.
