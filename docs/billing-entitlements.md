# Billing And Entitlements

PhonkLeaderboard keeps account login and paid access separate:

- Account login: Auth.js/NextAuth with Google OAuth.
- Billing provider: Paddle Billing.
- Local database: safe billing metadata, subscription status, plans, feature values, and usage counters.

The app must never store card numbers, PayPal account details, or payment method data. Paddle is the payment source of truth; the local database is a projection used to unlock app features.

## Required Environment Variables

Existing auth variables still apply:

- `AUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `ADMIN_EMAILS`
- `DATABASE_URL`

Billing variables:

- `PADDLE_ENVIRONMENT=sandbox` or `production`
- `PADDLE_API_KEY`
- `PADDLE_WEBHOOK_SECRET`

## Paddle Dashboard Setup

1. Create products/prices in Paddle for each paid tier.
2. Enable PayPal and card checkout in Paddle if available for the account/country.
3. Add the production webhook endpoint: `/api/webhooks/paddle`.
4. Subscribe to subscription and transaction events.
5. Copy each Paddle price ID into the matching tier in `/admin/tiers`.

## Feature/Tier Management

Admins manage tier behavior in `/admin/tiers`:

- Create tiers with custom slugs, names, rank, public visibility, and Paddle IDs.
- Create features with a value type: boolean, number, string, or JSON.
- Set each feature value per tier.
- Use `-1` for unlimited numeric limits.

Server-side enforcement currently uses these feature keys:

- `artist_submissions_per_month`
- `watchlist_limit`
- `sample_pack_uploads`
- `coverart_max_resolution`
- `priority_review`
- `advanced_analytics`

UI locks are informational only. API routes must enforce the actual limits through `src/lib/entitlements.ts`.

## Verification Checklist

1. Run `npm run build` after schema changes.
2. Confirm Google login still works.
3. In `/admin/tiers`, confirm Free and Premium seed automatically.
4. Set a Paddle price ID on the paid tier.
5. Use Paddle sandbox checkout from `/billing`.
6. Confirm `/api/webhooks/paddle` receives and verifies signed events.
7. Confirm `/api/me/entitlements` changes after webhook sync.
8. Test free tier limits for artist submissions and watchlist growth.