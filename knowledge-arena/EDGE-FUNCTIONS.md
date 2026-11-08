# Knowledge Arena Edge Functions — deployment and API notes

Status: code committed to `feature/knowledge-arena`; **not deployed**. The proposed SQL is not applied. No secrets, schedules, or production settings have been changed.

## Functions

### `knowledge-arena`
Student-facing API. All requests are POST JSON and require a valid Supabase user JWT in the Authorization header.

Supported actions:
- `get_catalog`
- `get_questions` — published MCQs for the student's own grade (or `General`)
- `get_daily_challenge` — reads an already-published challenge; it does not create one
- `submit_attempt` — checks private answer keys server-side and stores aggregate attempt totals only
- `get_my_progress`
- `get_leaderboard` — common leaderboard with pseudonymous display labels
- `get_admin_summary` — Admin-only aggregate metrics; no question text, answers or individual attempt drill-down
- `admin_control` — Admin-only generation/game switches, budget settings, disabled game/subject lists, job queue/pause/resume

Student access checks the exact LIB role `Student` and a linked student record. Subscription status is not checked. If a linked student has no grade, the API uses the `General` content band.

### `knowledge-arena-worker`
One-job-per-invocation scheduled generation worker. It:
1. Requires a separate `x-ka-worker-secret`.
2. Checks `ka_settings.generation_enabled` and the daily/monthly AI budget.
3. Claims one queued job atomically using `ka_claim_generation_job()`.
4. Reads the Anthropic key server-side from existing `ai_settings` using the service role. It does not call or modify the existing `ai-proxy`.
5. Generates evergreen MCQs, runs structural checks, checks duplicates and asks a second AI pass to reject doubtful/ambiguous content.
6. Publishes prompt/options and private answer key atomically through `ka_store_generated_question()`.
7. Records tokens, estimated cost, job state and failure summaries in `ka_generation_jobs`.

The second AI pass is an automated quality filter, not a guarantee of factual correctness. The initial generator intentionally avoids current affairs and time-sensitive questions.

## Required configuration before deployment

Existing Supabase Edge Function environment:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Knowledge Arena secrets/configuration:
- `KA_WORKER_SECRET` — long, random secret for the worker endpoint.
- `KA_INPUT_USD_PER_MILLION` — current provider input-token price for the selected model.
- `KA_OUTPUT_USD_PER_MILLION` — current provider output-token price for the selected model.
- `KA_ANTHROPIC_MODEL` — optional; defaults to `claude-haiku-4-5`.
- `KA_XP_PER_CORRECT` — not set by this build; requires an approved XP policy.
- `KA_PERFECT_ATTEMPT_BONUS` — not set by this build; requires an approved XP policy.
- `KA_DAILY_XP_CAP` — not set by this build; requires an approved replay/anti-farming policy.

The worker fails closed if provider token prices are missing. The student API refuses to save attempts until the three XP settings are configured. Do not guess these values.

The worker endpoint is protected both by the Supabase Edge gateway JWT verification and `KA_WORKER_SECRET`. A scheduler must send an authorised service-role bearer token plus the separate worker-secret header. Store both securely; never put them in browser code.

## Controlled production rollout (not performed)

There is no separate test database available. The agreed approach is to validate the isolated implementation and then test on production in small, explicitly approved steps. This is not permission to make production changes automatically.

1. Reconcile this branch with the current `main` branch and complete code review; do not merge while the branch is diverged.
2. Obtain a current production backup and inspect the live schema/readiness. Confirm exact role labels, grade mapping, table columns, existing grants and policies, and that no `ka_*` objects already exist.
3. Review and approve `knowledge-arena/proposed-schema.sql`. Apply only the new `ka_*` objects in one transaction, with generation and daily challenges disabled. Stop on any preflight mismatch.
4. Verify the created objects, RLS, grants, function privileges and protected-system boundary before proceeding.
5. Configure only the required server-side secrets and exact current model token prices. Do not configure XP values until the XP/replay policy is approved.
6. Deploy the API and worker with generation still disabled. Verify Student, Admin, Teacher and unauthenticated access, including students without an active subscription and students without a grade.
7. Run a small, explicitly approved generation pilot with a strict budget ceiling. Do not schedule recurring generation until the pilot is reviewed.
8. Test attempts, answer-key isolation, aggregate-only Admin reporting, XP limits and leaderboard behaviour using designated accounts.
9. Connect the student UI only after the API and production pilot are accepted. Enable broader student access only after a separate approval.

Each production step requires explicit approval before execution. No database migration, secret change, Edge Function deployment, scheduler, or student-facing enablement is performed by this code change.

## Deliberately not implemented / decisions still required

- Daily challenge creation/publication is not automated yet. The challenge length, subject mix, and how the common all-student competition group should handle different grade bands must be agreed first. The API can read and score a published challenge.
- All six game types currently use the MCQ data contract. The distinct interaction mechanic for Memory Challenge is not implemented.
- Leaderboard names are pseudonymous ("Player 1", etc.) pending approval of a public display-name policy.
- Game XP rate, perfect-attempt bonus, daily XP cap, streak rules and level thresholds are not hard-coded.
- Attendance gamification is not changed. The separate Admin attendance-gamification visibility requirement still needs a read-only integration with the existing attendance calculations.
- The current front-end prototype is not yet connected to these functions.

## Protected-system boundary

These functions and the proposed schema do not read from, write to, call, or alter any `qb_*` table, function, view, policy, trigger, or exam workflow. The existing `ai-proxy` is not modified. No existing app HTML, attendance calculation, teacher workflow, or Admin workflow is modified.
