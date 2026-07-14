# Momentum

Momentum is a user-defined daily planner for nested groups, daily habits,
persistent tasks, metrics, and reusable time slots.

## Stack

- Next.js 16 App Router
- React 19 and TypeScript
- Supabase Auth and PostgreSQL
- Row Level Security on every `m_` table

## Local setup

1. Copy `.env.example` to `.env.local` and provide the public Supabase URL and anon key.
2. Apply `supabase/migrations/202607140001_momentum_core.sql` in the Supabase SQL editor.
3. Run `npm install` and `npm run dev`.

The application intentionally does not use a Supabase service-role key.

Email/password authentication must be enabled in the Supabase Auth providers.
When email confirmation is enabled, new users need to confirm their address
before the first sign-in.

## Domain model

- Daily items are assigned to a date and one or more time slots.
- Persistent items have no date or time slot.
- Metric items accept one numeric entry per day and never appear in Focus.
- Historical assignment rows are retained for analytics.
- Future nutrition integration is represented by `source_type` and `source_id`.
