# Performance Audit Report

Project: PhonkLeaderboard
Audited By: Performance Optimizer Agent
Date: 2026-04-12
Status: IN PROGRESS

## Executive Summary
This audit iteration focused on eliminating UI remount/refetch churn when switching ranking entity/view modes and reducing duplicate network calls with short-lived session cache reuse.

## Baseline Metrics
| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Switch artists<->songs latency | Not yet measured | Not yet measured | Pending |
| Switch list<->bubbles latency | Not yet measured | Not yet measured | Pending |
| Duplicate ranking fetches per switch | High (refetch on remount) | Reduced (mounted views + cache reuse) | Qualitative |
| Bundle Size | Not measured in this pass | Not measured in this pass | Pending |

## Bottlenecks Identified
- Ranking subviews remounted during toggle transitions, causing fresh effects and repeated API calls.
- Ranking list and bubble views used direct fetch calls without shared short-lived client cache.
- Watchlist mutations could leave related ranking cache keys stale.

## Optimizations Applied
- Kept rankings subviews mounted (lazy-mount + hide/show) to preserve component state across view switches.
- Added sessionStorage-backed cached fetches for:
  - Artist list podium/full list/pagination/rank changes/watchlist IDs.
  - Song list podium/full list/pagination.
  - Bubble view artists changes/songs datasets/watchlist IDs.
- Added cache invalidation on artist watchlist mutation.

## Verification
- Production build succeeded after changes (`npm run build`).

## Next Measurements
- Capture before/after transition timing with browser performance marks.
- Capture request count deltas in DevTools Network for entity/view switches.
- Run Lighthouse and compare TTI/LCP impact for rankings route.
