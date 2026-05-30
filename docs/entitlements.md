# Paid Entitlements and Ad Suppression

## Source of truth
- Supabase subscriptions table mirrors Stripe.
- Use is_paid_user(user_id) or a server-side query for entitlements.

## UI rules
- Paid users can choose visibility: public, private, collaborators.
- Free users are limited to public visibility.
- Free-user forks are created as public regardless of UI selection.
- Collaborator management UI is shown only when paid.

## Ad suppression
- Layout includes AdSlot components guarded by is_paid_user.
- Server components fetch entitlements for initial render.
- Client hydration uses TanStack Query to keep paid status current.

## Forking behavior
- fork_institution, fork_course, fork_topic, fork_resource accept visibility.
- If not paid, visibility is forced to public by the RPC.

## Implementation sketch
- server/actions/getEntitlements.ts fetches paid flag from Supabase.
- components/ads/AdSlot.tsx returns null when paid.
- components/sharing/VisibilityPicker.tsx enforces paid-only options.
