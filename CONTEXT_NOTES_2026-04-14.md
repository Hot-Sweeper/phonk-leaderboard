# Context Notes - 2026-04-14

## Recent implemented fixes

- Added admin catalog repair tooling for missing songs and Deezer album/track imports.
- Fixed Deezer artist resolution to prefer Spotify-to-Deezer mapping before unsafe name search.
- Repaired the Ariis catalog after wrong Deezer mapping polluted tracks.
- Fixed rankings song search bug caused by stale async responses overwriting newer search results.

## Current performance diagnosis

- The site is not slow only because of SQL.
- The songs leaderboard route still performs live Deezer enrichment during page requests.
- Cold requests to the songs route can be very slow because provider calls are mixed into the read path.
- Several routes also fetch broad DB datasets and then sort/filter in Node instead of pushing more work into SQL.

## Desired architecture direction

- Public page requests should read only from Postgres and cache.
- Deezer and Spotify should be used only for:
  - scheduled sync jobs
  - ingestion
  - admin repair tools
- The platform should keep working with stale data if providers are temporarily unavailable.
- Sync cadence target discussed: every 24 hours.

## Legal and compliance conclusions

- Spotify public terms are stricter than a simple "store everything forever in the DB" model.
- A safer reading of Spotify terms is:
  - store only what is operationally necessary
  - treat provider metadata as renewable cache
  - do not assume indefinite archival is allowed
- If provider access is revoked or terms require deletion, provider-controlled cached content may need to be removed.
- Internal derived data is safer to retain than raw provider-controlled display metadata.

## Higher-risk items

- Scraped Spotify monthly listeners are a higher legal and platform-risk area than official API data.
- User clarified later that Spotify followers, TikTok followers, and Instagram followers are also scraped in practice, so they should also be treated as high-risk scraped inputs unless replaced with a licensed or official source.
- Live provider calls in request-time page rendering are bad for both scale and resilience.
- "Keep provider content forever even if access ends" is not the safe posture.

## What is safer to keep long-term

- Internal rankings
- Snapshots and trend history
- Derived analytics
- Internal match and dedupe tables
- Admin/moderation/forum data
- Sync timestamps and sync status

## What should be treated as renewable cache

- Provider metadata such as names, artwork URLs, preview URLs, genres, popularity-like display metrics, and provider profile details.
- Provider-linked display fields should ideally be refreshed on schedule and not treated as immutable archival data.

## Monthly listeners conclusion

- Spotify's official API does not provide monthly listeners.
- Current monthly listener support depends on scraping, which is the most legally risky part of the current data model.
- Safer alternatives are:
  - officially licensed third-party audience metrics
  - Deezer/other official metrics
  - internal trend metrics derived from stored snapshots
  - licensed third-party analytics providers if monthly listeners are mandatory

## Follower metrics clarification

- Later in the conversation, the user clarified that Spotify followers, TikTok followers, and Instagram followers are also scraped in practice.
- That means these should not be treated as low-risk official API inputs in planning unless the implementation changes to an approved or licensed source.
- For future Audience Score planning, the safest long-term core should favor internal history, derived trend signals, and any officially sourced metrics that can be contractually defended.

## Can popularity score be stored?

- Yes, popularity score can be stored technically and it already is stored in the current schema.
- Legally it should be treated as provider-sourced metadata, meaning safer as operational cache rather than assumed perpetual archive.

## Spotify-derived data currently stored

- Artist-level:
  - spotifyId
  - artist name on create
  - imageUrl
  - genres
  - spotifyPopularity
- Spotify artist link-level:
  - url
  - handle
  - followerCount
  - monthlyListeners
  - platformId
- Artist snapshots:
  - monthlyListeners history
  - followerCount history
- Track-level:
  - spotifyId
  - spotifyUrl
  - name
  - albumName
  - albumImageUrl
  - previewUrl
  - durationMs
  - popularity
  - trackNumber
  - discNumber
  - explicit
  - releaseDate
  - featuredArtists

## Best next engineering steps

1. Remove live Deezer enrichment from public songs API responses.
2. Persist missing provider-derived display data during sync instead of at read time.
3. Replace scraped Spotify monthly listeners with a safer metric or licensed source.
4. Move more ranking/filtering/pagination work into SQL or precomputed leaderboard tables.
5. Add explicit provider-data retention and deletion policy before deeper migration.

## Important current workspace state

- Unrelated local uncommitted files still existed during this conversation:
  - src/app/api/songs/[id]/snapshots/route.ts
  - src/components/panels/SongPanel.tsx
- The song search race fix was applied in src/components/rankings/SongListView.tsx and validated with `npx tsc --noEmit`.
