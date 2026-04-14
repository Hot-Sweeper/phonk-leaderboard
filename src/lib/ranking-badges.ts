export type BadgeTone = "amber" | "emerald" | "cyan" | "rose" | "violet" | "zinc" | "slate";
export type BadgeKind = "new" | "new_forum" | "collecting" | "trending" | "viral" | "underrated" | "downfall" | "dead";

export type RankingBadge = {
  kind: BadgeKind;
  label: string;
  description: string;
  tone: BadgeTone;
};

type SongBadgeInput = {
  createdAt: string | null;
  releaseDate: string | null;
  popularity: number;
  metricValue: number;
  trendPercent: number;
  hasTrendData: boolean;
  showCollectingData?: boolean;
};

type ArtistBadgeInput = {
  createdAt: string | null;
  currentValue: number;
  changeValue: number;
  changePercent: number;
  hasData: boolean;
  showCollectingData?: boolean;
};

const NEW_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const COLLECTING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function isRecent(releaseDate: string | null) {
  if (!releaseDate) return false;
  const parsed = Date.parse(releaseDate);
  if (Number.isNaN(parsed)) return false;
  const age = Date.now() - parsed;
  return age >= 0 && age <= NEW_WINDOW_MS;
}

function isRecentlyAdded(createdAt: string | null) {
  if (!createdAt) return false;
  const parsed = Date.parse(createdAt);
  if (Number.isNaN(parsed)) return false;
  const age = Date.now() - parsed;
  return age >= 0 && age <= COLLECTING_WINDOW_MS;
}

function pushBadge(target: RankingBadge[], badge: RankingBadge, limit = 3) {
  if (target.some((existing) => existing.kind === badge.kind)) return;
  if (target.length >= limit) return;
  target.push(badge);
}

export function getSongRankingBadges(song: SongBadgeInput): RankingBadge[] {
  const badges: RankingBadge[] = [];
  const recentlyAdded = isRecentlyAdded(song.createdAt);

  if (isRecent(song.releaseDate)) {
    pushBadge(badges, {
      kind: "new",
      label: "NEW RELEASE",
      description: "Released recently. This track is still in its first month.",
      tone: "amber",
    });
  }

  if (song.showCollectingData && recentlyAdded && !song.hasTrendData) {
    pushBadge(badges, {
      kind: "collecting",
      label: "COLLECTING DATA",
      description: "This track was added recently, so the forum is still building enough history for change leaderboards.",
      tone: "slate",
    });
  }

  if (!song.hasTrendData) {
    return badges;
  }

  if (song.trendPercent >= 140 || song.metricValue >= 250_000) {
    pushBadge(badges, {
      kind: "viral",
      label: "VIRAL",
      description: "Exploding right now with an unusually large lift in streams.",
      tone: "cyan",
    });
  } else if (song.trendPercent >= 35 || song.metricValue >= 35_000) {
    pushBadge(badges, {
      kind: "trending",
      label: "TRENDING",
      description: "Momentum is climbing fast in the current ranking window.",
      tone: "emerald",
    });
  }

  if (song.popularity <= 400_000 && song.trendPercent >= 22) {
    pushBadge(badges, {
      kind: "underrated",
      label: "UNDERRATED",
      description: "Growing hard despite still being smaller than the songs around it.",
      tone: "violet",
    });
  }

  if (song.trendPercent <= -30 && song.popularity >= 80_000) {
    pushBadge(badges, {
      kind: "downfall",
      label: "DOWNFALL",
      description: "This track is dropping sharply in the selected trend window.",
      tone: "rose",
    });
  }

  return badges;
}

export function getArtistRankingBadges(artist: ArtistBadgeInput): RankingBadge[] {
  const badges: RankingBadge[] = [];
  const recentlyAdded = isRecentlyAdded(artist.createdAt);

  if (artist.showCollectingData && recentlyAdded) {
    pushBadge(badges, {
      kind: "new_forum",
      label: "NEW TO FORUM",
      description: "This artist was added to the forum recently and may still be settling into the rankings.",
      tone: "amber",
    });
  }

  if (artist.showCollectingData && recentlyAdded && !artist.hasData) {
    pushBadge(badges, {
      kind: "collecting",
      label: "COLLECTING DATA",
      description: "The forum is still collecting enough history to calculate reliable change stats for this artist.",
      tone: "slate",
    });
  }

  if (artist.hasData) {
    if (artist.changePercent >= 80 || artist.changeValue >= 500_000) {
      pushBadge(badges, {
        kind: "viral",
        label: "VIRAL",
        description: "This artist is breaking out with a massive stream jump right now.",
        tone: "cyan",
      });
    } else if (artist.changePercent >= 18 || artist.changeValue >= 75_000) {
      pushBadge(badges, {
        kind: "trending",
        label: "TRENDING",
        description: "This artist is lifting off and gaining momentum fast.",
        tone: "emerald",
      });
    }

    if (artist.currentValue <= 350_000 && artist.changePercent >= 12) {
      pushBadge(badges, {
        kind: "underrated",
        label: "UNDERRATED",
        description: "Strong growth without the stream numbers usually needed to get noticed yet.",
        tone: "violet",
      });
    }

    if (artist.changePercent <= -25 || artist.changeValue <= -100_000) {
      pushBadge(badges, {
        kind: "downfall",
        label: "DOWNFALL",
        description: "This artist is taking a serious hit in the selected trend window.",
        tone: "rose",
      });
    }
  }

  if (!artist.showCollectingData && artist.currentValue <= 20_000 && (!artist.hasData || artist.changePercent <= -35)) {
    pushBadge(badges, {
      kind: "dead",
      label: "DEAD",
      description: "Very low stream activity with barely any remaining momentum. Reserved for rare ghost-level cases.",
      tone: "zinc",
    });
  }

  return badges;
}