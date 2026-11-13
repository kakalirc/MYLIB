# Question Bank module shell

This directory is the isolated shell for the future Question Bank module. It is not yet wired into My LIB navigation and does not replace any existing Question Bank screen.

## Ownership boundary

**My LIB host retains ownership of:**
- Supabase authentication and the active session
- User ID, linked ID, role and permission decisions
- Shared lookup data and application navigation
- Notifications and refresh/invalidation of shared screens
- All database access through host-approved, feature-specific operations

**Question Bank module will own:**
- Its page markup, styles and feature-specific client-side presentation
- Admin and Teacher Question Bank screens after migration
- Past Papers and Practice Papers screens after migration
- Module-local view state and rendering

The module must not create a second Supabase client, persist a second login session, accept credentials in URLs, or implement its own permission policy.

## Host messaging contract (same-origin iframe)

1. The host embeds question-bank.html in a same-origin iframe.
2. The module sends LIB_QB_READY with protocol version 1.
3. The host responds with LIB_QB_INIT and a minimal context object (role, userId, linkedId, and only the lookup data required by the active workflow).
4. The module requests host operations with LIB_QB_REQUEST (requestId, method, payload); the host replies with LIB_QB_RESPONSE.
5. The module requests navigation back with LIB_QB_CLOSE.

The host must validate event.origin, event.source, the current authenticated user, role permissions, and an explicit allowlist of operation names and payload shapes for every request. Never expose a generic arbitrary SQL/RPC proxy. Every database operation must be authorised by the host and by Supabase RLS. Do not send access tokens or service-role credentials to the iframe.

## Current status

- Shell, responsive styles and versioned message bridge scaffold: added.
- Host iframe launcher and request dispatcher: not added yet.
- Existing Question Bank workflows: unchanged and still in index.html and existing supporting scripts.
- Database migrations, Edge Functions and production deployment: unchanged.

## Migration gate

Migrate one workflow at a time only after its dependencies, host operations, permission checks, refresh behaviour and cross-feature consumers are mapped. Keep the existing implementation available until role-based regression tests pass for Admin, Teacher, Student and Parent journeys.
