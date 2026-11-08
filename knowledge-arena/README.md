# LIB Knowledge Arena — isolated first-stage build

This directory is deliberately separate from the existing `index.html`.

## Files
- `knowledge-arena.html`: responsive student/admin preview shell and sample game UI.
- `knowledge-arena.css`: isolated styles.
- `knowledge-arena.js`: client-side sample quiz flow.

## Current status
This is an interactive front-end prototype only. It uses sample questions, sample leaderboard rows, and browser-memory XP. It is **not connected** to LIB authentication, Supabase, student records, attendance gamification, AI question generation, scheduled challenges, or persistent scoring.

The Admin overview is a display of the intended summary-only reporting boundary. Its metrics are intentionally placeholders. The existing attendance gamification values must later be read from the current attendance implementation without duplicating or changing its calculations.

## Production work still required
1. Inspect the actual Supabase database schema and live application: tables, columns, constraints, indexes, relationships, views, RPCs, triggers, RLS policies, authentication, roles, student identity mapping, and existing attendance XP/level/badge/streak functions.
2. Map every Knowledge Arena requirement to existing tables, columns, views, and functions. Reuse and extend existing structures where suitable; do not create a new table if an existing one can safely support the requirement.
3. Only if the schema audit proves a requirement cannot be supported by any existing structure, propose the smallest necessary schema addition for discussion and approval before writing or applying a migration. No database table has been created by this prototype.
4. Implement server-side score validation and award logic; do not trust client-submitted score or XP values.
5. Implement AI generation, independent validation, duplicate checks, age/class/subject/difficulty tagging, provenance, review/expiry metadata, retry handling, cost caps, and safe automatic publication using the agreed data model.
6. Implement scheduled question-bank replenishment and daily challenge publication.
7. Replace sample content with class-appropriate content and implement the agreed game formats.
8. Connect student identity and subscription-independent access for all LIB login holders.
9. Add Admin summary reporting for Knowledge Arena and a separate read-only view of existing attendance gamification.
10. Test with non-production users, verify permissions/RLS, and deploy through the existing hosting pipeline.

## Explicit separation from the exam Question Bank and Online Assessment
- The existing LIB Question Bank and Online Assessment system is reserved for exam practice and must be left alone.
- Knowledge Arena must have its own independent game-question lifecycle, question storage, attempts, scoring, and reporting. Do not read from, write to, extend, or alter any `qb_*` table, function, view, policy, trigger, or assessment workflow.
- The existing assessment system is not a source of Knowledge Arena questions, even if some of its tables appear technically reusable.
- Any new Knowledge Arena persistence must first be designed against the complete non-assessment schema. Reuse suitable non-`qb_*` structures only where doing so is safe and does not couple the Arena to exam practice. If dedicated storage is needed, present the minimal proposed schema for approval before creating anything.

## Non-negotiable compatibility constraints
- Do not replace or rewrite the existing `index.html`.
- Existing student dashboard, attendance, teacher/admin workflows, and attendance gamification must remain unchanged.
- Attendance XP, levels, badges, streaks, and leaderboard calculations must be reused, not reimplemented.
- Knowledge Arena XP and rewards remain separate from attendance gamification.
- Admin Knowledge Arena reports expose aggregate/summary performance only, not individual questions, answers, or question-by-question history.
- All students with a LIB login can access the Arena, regardless of subscription status.
- Admin routine question creation/approval is not part of the intended automated workflow; Admin monitors and can pause/disable defective content or automation.
