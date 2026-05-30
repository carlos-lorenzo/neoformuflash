# Stripe Billing Integration

## Overview
- Stripe is the source of truth for paid entitlements.
- Supabase stores a local mirror for fast reads and RLS-controlled access.

## Tables
- billing_customers: maps Supabase user_id to stripe_customer_id.
- subscriptions: subscription state, price/product ids, and period data.

## Webhook endpoint
- Route: /api/stripe/webhook (Node runtime, raw body required).
- Verify signature with STRIPE_WEBHOOK_SECRET.
- Use SUPABASE_SERVICE_ROLE_KEY to upsert billing tables.

## Event mapping
- customer.created
  - Upsert billing_customers (user_id must be set from metadata if available).
- checkout.session.completed
  - If mode=subscription, fetch customer and subscription.
  - Upsert billing_customers and subscriptions.
- customer.subscription.created
- customer.subscription.updated
  - Upsert subscriptions fields: status, price_id, product_id,
    current_period_end, cancel_at_period_end, trial_end, metadata.
- customer.subscription.deleted
  - Set status=canceled and current_period_end.
- invoice.payment_failed
  - Set status=past_due or unpaid based on Stripe payload.

## Linking a Stripe customer to a user
- When creating a Checkout Session, set metadata.supabase_user_id.
- On webhook events, use metadata.supabase_user_id to resolve user_id.
- If metadata is missing, fallback to lookup by stripe_customer_id.

## Entitlements
- is_paid_user(user_id) returns true for trialing/active.
- UI uses paid flag to hide ads and unlock private/collaborator visibility.

## Secrets and env vars
- STRIPE_SECRET_KEY
- STRIPE_WEBHOOK_SECRET
- SUPABASE_SERVICE_ROLE_KEY
- SUPABASE_URL

## Failure handling
- Webhook handler should be idempotent using upserts.
- Log unknown events for debugging.
- Retry with Stripe's automatic webhook retry policy.
