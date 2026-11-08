# Knowledge Arena backend contract

Status: Student/Admin UI and authenticated API source are implemented on the feature branch. No live database migration or Edge Function deployment has occurred.

## Security boundaries

- Authenticate every API request with the caller's Supabase JWT.
- Resolve the caller through `profiles.id = auth.uid()`.
- Student play requires exact role `Student` and a non-null linked student record. Admin endpoints require exact role `Admin`.
- Subscription status is not checked for Knowledge Arena access.
- All answer checking and XP awards happen server-side. Never accept a client-supplied score, XP total, rank, badge or streak as authoritative.
- The browser submits question IDs and selected option indexes. The API loads private answer keys, evaluates the attempt and persists only aggregate totals. Individual selected answers are not stored.
- Admin reporting returns aggregate performance and operational job metadata only; no question text, answer options, answer keys, individual Q&A or question-level history.
- Answer-key, generation-job, settings and AI-usage tables are server-role-only.
- AI credentials remain server-side. The browser never receives `ai_settings.api_key`.
- Do not use or modify the existing generic `ai-proxy` for this feature.

## API actions

- `get_context`: authenticated role and Student grade-band context.
- `get_catalog`: enabled games, available subjects, own progress and grade band.
- `get_questions`: published questions matching the Student's grade band, game and selected subject.
- `get_daily_challenge`: today's published ten-question challenge for the Student's grade band.
- `submit_attempt`: accepts question IDs, selected option indexes, game type and optional challenge ID; validates published question eligibility; checks answer keys server-side; applies the XP policy; stores only an aggregate row; updates player stats and achievement unlocks.
- `get_my_progress`: own aggregate stats and all active achievements with unlocked status.
- `get_leaderboard`: common all-student leaderboard with pseudonymous labels and Game XP.
- `get_admin_summary`: Admin-only aggregate metrics and shared AI usage.
- `get_admin_options`: Admin-only grades and subjects for generation setup.
- `get_admin_jobs`: Admin-only generation job status/metadata; no generated question content.
- `admin_control`: Admin-only master switches, shared INR budgets, generation job queue/pause/resume and manual daily challenge publication.

## Scoring and game rules

- 5 Game XP per correct answer.
- 10 additional Game XP for a perfect attempt.
- 100 Game XP maximum per Student per India-local day.
- Unlimited attempts; the daily XP cap limits rewards, not access to practice.
- Attendance XP, attendance levels, attendance badges and attendance streaks are independent and unchanged.
- One common competition group and leaderboard across grade bands.
- Leaderboard is currently all-time Game XP, sorted by Game XP and then games played.
- Public leaderboard names are pseudonymous.
- Memory Challenge uses a recall mechanic: display the prompt for six seconds, then hide it and show answer options. It still uses the common MCQ storage and scoring contract.

## Daily challenge

- Ten questions per active grade band each India-local day.
- Use published `quick_quiz` questions and select across available subjects.
- Prefer exact-grade questions; if fewer than ten are available, use ten General questions as the fallback for that grade.
- Do not publish a partial set for a grade.
- Admin can publish today's challenge manually. The worker also attempts publication whenever the daily-challenge setting is enabled.
- Automatic daily execution requires a deployed worker and a configured schedule; neither is live yet.

## AI generation and shared budget

- Anthropic Messages API, with the API key read server-side from the existing LIB AI settings row.
- Shared budget across all students and all Knowledge Arena AI generation: default ₹100/day and ₹1,000/month.
- Both windows use India-local calendar boundaries.
- Admin can change the daily and monthly INR limits. Daily limit cannot exceed monthly limit.
- Provider input/output token prices and the USD/INR rate are required server-side configuration. The worker fails closed if any are missing or invalid.
- Each invocation reserves a conservative estimated maximum before provider calls. Actual token usage is settled on success; uncertain failures remain reserved for review.
- A tokenised singleton database lease and heartbeat serialise workers so parallel invocations cannot overspend the shared budget.
- AI generation is disabled by default. When a budget limit is reached, new generation jobs pause; already-published questions remain available.

## Admin visibility

- Aggregate counts: registered linked student logins, active players, games played, published question count, average accuracy and AI usage.
- Operational generation job status and error summary.
- No individual student answer history, question-level performance, prompt content or answer-key access.
- Read-only integration with existing attendance XP/levels/badges/streak metrics remains outstanding and must reuse existing calculations rather than duplicate them.

## Protected-system boundary

- Do not read, write, call, extend or alter any existing `qb_*` object or Question Bank / Online Assessment workflow.
- Do not modify existing attendance calculations or rewards.
- Do not modify unrelated teacher, parent or Admin workflows.
- All proposed tables, policies, RPCs and grants remain design-only until reviewed and explicitly approved for production.
