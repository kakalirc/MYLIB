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
1. Inspect the live application authentication, role model, student identity mapping, Supabase schema, and existing attendance XP/level/badge/streak functions.
2. Add and review database migrations with row-level security for question bank, game sessions, validated attempts, game XP, achievements, daily challenges, aggregate reporting, and automation logs.
3. Implement server-side score validation and award logic; do not trust client-submitted score or XP values.
4. Implement AI generation, independent validation, duplicate checks, age/class/subject/difficulty tagging, provenance, review/expiry metadata, retry handling, cost caps, and safe automatic publication.
5. Implement scheduled question-bank replenishment and daily challenge publication.
6. Replace sample content with class-appropriate content and implement the agreed game formats.
7. Connect student identity and subscription-independent access for all LIB login holders.
8. Add Admin summary reporting for Knowledge Arena and a separate read-only view of existing attendance gamification.
9. Test with non-production users, verify permissions/RLS, and deploy through the existing hosting pipeline.

## Non-negotiable compatibility constraints
- Do not replace or rewrite the existing `index.html`.
- Existing student dashboard, attendance, teacher/admin workflows, and attendance gamification must remain unchanged.
- Attendance XP, levels, badges, streaks, and leaderboard calculations must be reused, not reimplemented.
- Knowledge Arena XP and rewards remain separate from attendance gamification.
- Admin Knowledge Arena reports expose aggregate/summary performance only, not individual questions, answers, or question-by-question history.
- All students with a LIB login can access the Arena, regardless of subscription status.
- Admin routine question creation/approval is not part of the intended automated workflow; Admin monitors and can pause/disable defective content or automation.
