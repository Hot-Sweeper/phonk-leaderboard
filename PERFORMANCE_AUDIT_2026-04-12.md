# Performance Audit Report

Project: PhonkLeaderboard
Audited By: Performance Optimizer Agent
Date: 2026-04-12
Status: IN PROGRESS

## Executive Summary
This audit iteration focused on reducing initial rankings fan-out, collapsing duplicate client fetches, and caching repeated watchlist reads on the server.

## Baseline Metrics
| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Hidden rankings view fetches on load | Present | Eliminated | Qualitative |
| Watchlist details repeat latency | 1742-2014 ms | 4-6 ms | ~99.7% |
| Watchlist ids repeat latency | 296-1222 ms | 5 ms | ~98-99% |
| Songs leaderboard warm latency (`take=50`) | 408-410 ms cold | 10 ms warm | ~97.6% |
| Bundle Size | Not measured in this pass | Not measured in this pass | Pending |

## Bottlenecks Identified
- Inactive rankings views still mounted and reacted to prop changes, creating unnecessary background fetches.
- Concurrent client effects could issue duplicate requests for the same cache key before localStorage was populated.
- Watchlist reads repeatedly hit Postgres for identical per-user payloads.
- The songs leaderboard sorted globally by popularity without a dedicated global popularity index.
- Local development was also starting the auto-update scheduler, which triggered overdue external sync jobs and injected 60-second stalls into unrelated requests.
- Trend-mode song queries used a huge per-track snapshot filter that could exceed the database parameter limit.

## Optimizations Applied
- Kept rankings subviews mounted (lazy-mount + hide/show) to preserve component state across view switches.
- Added sessionStorage-backed cached fetches for:
  - Artist list podium/full list/pagination/rank changes/watchlist IDs.
  - Song list podium/full list/pagination.
  - Bubble view artists changes/songs datasets/watchlist IDs.
- Added cache invalidation on artist watchlist mutation.
- Added an `active` gate so only the visible rankings view performs network work.
- Added in-flight client request deduplication in the shared cache helper.
- Added short-lived server-side watchlist response caching plus invalidation on watchlist mutation.
- Disabled session refetch on window focus in the shared `SessionProvider`.
- Added and pushed a global descending `Track.popularity` index to Postgres.
- Disabled the auto-update scheduler during normal local development unless `ENABLE_LOCAL_SCHEDULER=true` is set.
- Removed the oversized `trackId IN (...)` snapshot filter from trend-mode song queries.

## Verification
- Prisma schema validated successfully (`npx prisma validate`).
- Database schema synced successfully after adding the global popularity index (`npx prisma db push`).
- Local API benchmark after watchlist caching:
  - `/api/watchlist?details=true`: 2014 ms, 6 ms, 4 ms
  - `/api/watchlist`: 296 ms, 5 ms, 5 ms
- Local dev server log after restart showed:
  - `/api/songs?...take=50...`: 410 ms cold, 10 ms warm
  - `/api/watchlist?details=true`: 1486 ms cold, 4 ms warm
- After disabling the local scheduler and restarting, `/api/songs?skip=0&take=3&collapseVersions=true&mode=day&sort=desc&valueMode=absolute` returned in 483 ms instead of timing out at 60 s.

## Next Measurements
- Capture browser-side request counts from a single clean profile to quantify the fan-out reduction on `/rankings`.
- Measure cold `/api/songs` latency again after the new popularity index with a quiet browser session.
- Run Lighthouse and compare TTI/LCP impact for the rankings route.
