import type { PersonaType } from "@prisma/client";

export const PERSONA_TYPES: PersonaType[] = ["ARTIST", "LABEL", "COVER_ARTIST", "CONSUMER"];

export const PERSONA_LABELS: Record<PersonaType, string> = {
  ARTIST: "Artist",
  LABEL: "Label",
  COVER_ARTIST: "Cover Artist",
  CONSUMER: "Fan / Consumer",
};

export const GENRE_SUGGESTIONS = [
  "phonk",
  "brazilian-funk",
  "dark-phonk",
  "drift-phonk",
  "memphis-phonk",
  "gym-phonk",
  "sigma-phonk",
  "funk",
];
