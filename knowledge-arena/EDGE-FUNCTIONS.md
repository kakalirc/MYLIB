# Knowledge Arena Edge Functions — deployment and API notes

Status: source code and UI integration are prepared on `feature/knowledge-arena`; **not deployed**. The proposed SQL is not applied. No secrets, schedules or production settings have been changed.

## Functions

### `knowledge-arena`
Student/Admin API. All requests are POST JSON and require a valid Supabase user JWT in the Authorization header.

Actions:
- `get_context` — authenticate and return Student/Admin role; Student grade is resolved from the linked LIB student record.
- `get_catalog`, `get_questions`, `get_daily_challenge`, `submit_attempt`, `get_my_progress`, `get_leaderboard`.
- `get_admin_summary`, `get_admin_options`, `get_admin_jobs`, `get_admin_usage_reviews`, `admin_control` (including Admin-reviewed settlement of unsettled AI usage).

Student access checks the exact LIB role `Student` and a linked student record. Subscription status is not checked. A linked student without a grade uses the `General` content band. Admin actions require the exact Admin role. Admin reports are aggregate-only.

The Student UI now uses the existing Supabase browser session on the same origin. It responds to the My LIB cross-tab logout signal. If the API/schema is not deployed, the page clearly falls back to sample preview mode; preview answers and scores are not saved. The Admin UI includes budget controls and generation job controls, but these require the live API/schema to function.

### `knowledge-arena-worker`
One-job-per-invocation AI generation worker. It also accepts `{"action":"publish_daily_challenges"}` for a scheduled daily publication call.

1. Requires a separate `x-ka-worker-secret`.
2. Claims a job using a token-owned singleton lease. The lease is renewed during processing and only its owner can release it.
3. Checks shared India-local daily/monthly INR budgets before any paid AI call. Defaults are ₹100/day and ₹1,000/month across all students.
4. Reserves a conservative estimated batch cost in the private `ka_ai_usage` ledger before calling the provider. Settled actual cost replaces the reservation; interrupted/uncertain calls remain reserved for Admin review.
5. Reads the Anthropic key server-side from existing `ai_settings` using service role. It does not call or modify the existing `ai-proxy`.
6. Generates evergreen MCQs, checks structure/metadata/duplicates and runs a second AI validation pass.
7. Publishes question prompts/options and private answer keys atomically through `ka_store_generated_question()`.
8. Can publish ten grade-specific questions per active grade when a full set is available. This action is idempotent for a given India-local date.

The second AI pass is a quality filter, not a guarantee of factual correctness. The initial generator avoids current affairs and time-sensitive questions.

## Required configuration before deployment

Existing Supabase Edge Function environment:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Knowledge Arena secrets/configuration:
- `KA_WORKER_SECRET` — long, random secret for the worker endpoint.
- `KA_INPUT_USD_PER_MILLION` — current provider input-token price for the selected model.
- `KA_OUTPUT_USD_PER_MILLION` — current provider output-token price for the selected model.
- `KA_USD_INR_RATE` — current USD-to-INR conversion rate. The worker fails closed if token prices or this rate are missing; it records the rate used per batch.
- `KA_ANTHROPIC_MODEL` — optional; defaults to `claude-haiku-4-5`.
- `KA_XP_PER_CORRECT` — optional; defaults to 5.
- `KA_PERFECT_ATTEMPT_BONUS` — optional; defaults to 10.
- `KA_DAILY_XP_CAP` — optional; defaults to 100 XP per student per India-local day.

Never put service-role keys, worker secrets or Anthropic credentials in browser code or chat.

## Scheduling design (not configured)

- A worker invocation with no action processes one queued generation job.
- A daily scheduler can invoke the same worker with `{"action":"publish_daily_challenges"}` once per India-local day, using the service-role bearer token and `KA_WORKER_SECRET` stored securely in the scheduler.
- The daily publish function creates one grade-specific challenge per active grade, each with exactly ten questions. If a grade lacks ten published questions, that grade is skipped and reported. The competition leaderboard remains common across grades.
- No cron schedule, Vault secret, worker secret or recurring invocation has been configured.

## Production rollout (not performed)

There is no separate test database available. The agreed approach is to validate the isolated implementation and then test on production in small, explicitly approved steps. No production operation is being performed by this branch work.

1. Review the branch and current `main`; keep this PR unmerged until user review.
2. Obtain a current production backup and inspect the live schema/readiness. Confirm role labels, grade mapping, existing grants/policies and absence of all `ka_*` objects.
3. Review and explicitly approve `knowledge-arena/proposed-schema.sql`. Apply only the new `ka_*` objects, with generation and daily challenges disabled. Stop on any preflight mismatch.
4. Verify RLS, table grants, function privileges, worker lease and AI usage ledger before proceeding.
5. Configure server-side secrets and current model token prices/USD-INR rate securely.
6. Deploy API and worker with generation disabled. Verify Student, Admin, Teacher and unauthenticated access.
7. Run a small, explicitly approved generation pilot under the shared ₹100/day and ₹1,000/month limits.
8. Test server-side answer evaluation, aggregate-only reporting, XP caps, daily challenge length/grade matching and leaderboard behaviour.
9. Configure the daily scheduler only after the manual publication action is validated and the schedule is explicitly approved.
10. Enable broader student access only after the final UI and pilot are accepted.

No merge, production migration, secret change, Edge Function deployment, schedule or student-facing enablement has occurred.

## Protected-system boundary

No Knowledge Arena function or schema reads from, writes to, calls, or alters any `qb_*` table, function, view, policy, trigger or exam workflow. Existing `ai-proxy`, attendance reward calculations, teacher workflows and Parent/Teacher settings are not modified.
