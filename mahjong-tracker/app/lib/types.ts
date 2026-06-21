// Core data types for the tracker. The card + hands are intentionally modeled
// as DATA (not hardcoded UI) so that future versions can support multiple years
// or user-entered / photographed cards without touching the app code.

export interface Hand {
  /** Stable id, e.g. "2026-0". Used as the key for win counts + notation edits. */
  id: string;
  category: string;
  /** Display notation, e.g. "FF 2026 2026 DDDD". Editable by the user. */
  notation: string;
  points: number;
  /** Concealed hand — gets the (C) badge. */
  concealed: boolean;
}

export interface MahjongCard {
  year: number;
  /** 'NMJL' (licensed, v2+) | 'sample' (placeholder) | 'custom' (user-entered). */
  source: 'NMJL' | 'sample' | 'custom';
  categories: string[];
  hands: Hand[];
}

/** A logged win in the local Wins journal. Photo is stored as a Blob in IndexedDB. */
export interface Win {
  id: string;
  /** Hand id this win is for, or null for a freeform win. */
  handId: string | null;
  /** Cached notation label so the feed renders even if the card changes. */
  handLabel: string | null;
  note: string;
  photo: Blob | null;
  createdAt: number;
}
