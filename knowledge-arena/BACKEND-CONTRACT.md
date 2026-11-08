# Knowledge Arena backend contract

Status: implementation specification for the isolated Knowledge Arena branch. No live backend or database has been changed.

## Security boundaries

- Authenticate every request using the caller's Supabase JWT.
- Resolve the caller through `profiles.id = auth.uid()`; only the exact LIB Student role with a non-null `linked_student_id` can play.
- Subscription status is not checked for Knowledge Arena access.
- All score evaluation and XP awards happen server-side. Never accept a client-supplied score, XP total, rank, badge, or streak as authoritative.
- The browser may submit question IDs and selected option indexes. The server loads private answer keys, calculates the result, and persists only aggregate attempt data. It must not persist per-question answer history.
- Admin reporting is aggregate-only. Admin endpoints must not return prompt text, answer options, answer keys, per-question correctness, or per-question history.
- The answer-key, generation-job, and settings tables are service-role-only.
- AI credentials remain server-side. Do not return `ai_settings.api_key` to any browser.
- Do not depend on the existing generic AI proxy until its usage accounting and scheduled-job behaviour have been separately reviewed.

## API actions

1. `get_catalog`: return enabled game types, subject categories, and the student's own Game XP/level summary.
2. `get_questions`: return published questions matching the authenticated student's grade, selected subject/game, and difficulty. Return only prompt, options, and safe metadata; never return answer keys.
3. `submit_attempt`: accept question IDs, selected option indexes, game type, and optional challenge ID. Validate ownership/eligibility and that every question is published and applicable; calculate score on the server; award XP under the approved scoring policy; store only an aggregate row in `ka_attempts`; update `ka_player_stats`; evaluate achievements.
4. `get_my_progress`: return only the caller's aggregate stats and achievements.
5. `get_leaderboard`: return the common student leaderboard with Game XP and display name only.
6. `get_admin_summary`: Admin-only aggregate metrics via `ka_admin_summary()`. No student-level attempt drill-down and no question-level data.
7. `admin_control`: allow authorised Admin to pause/resume generation, pause a game/subject or daily challenge, and set AI budgets. Do not offer question text or answer inspection.

## AI generation worker

- Runs on a schedule or controlled job trigger, not once per student request.
- Reads only Knowledge Arena configuration and writes only `ka_*` objects.
- Generates batches by subject, grade, language, game type, and difficulty.
- Requires structured output; rejects malformed questions, invalid option counts, missing explanations, unsupported answer indexes, duplicates, unsuitable difficulty, and missing provenance for time-sensitive facts.
- Runs independent validation and deduplication before publishing.
- Inserts question prompts/options into `ka_questions` and answer indexes into `ka_question_keys` in one transaction.
- Publishes only questions that pass validation; failed batches remain quarantined and alert Admin through summary status.
- Enforces daily/monthly AI budgets and a kill switch.
- Never reads from or writes to any exam/assessment data.

## Unresolved policy choices (do not silently assume)

- Grade/age bands and how grade progression is mapped to game difficulty.
- Exact daily challenge length and subject mix.
- XP formula, replay XP eligibility, streak definition, and level thresholds.
- Whether leaderboard is all-time only or also weekly/monthly.
- Whether leaderboard display uses LIB username or a student-friendly alias.
- Supported languages and content distribution by language.
- Which Admin controls are enabled initially.
