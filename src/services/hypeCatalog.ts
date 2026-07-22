/**
 * Hype pings — the pickable cheer/nudge variants.
 *
 * SECURITY NOTE: clients send only a `hypeId`. The Cloud Function renders the
 * actual push copy from ITS OWN mirror of this catalog
 * (`functions/hype-catalog.js`), so a modified client can never push arbitrary
 * text to another user's phone. Keep the two files in lockstep — same ids,
 * same copy — exactly like the dual scorers.
 *
 * `kind` drives which section of the picker an entry appears in and which
 * notification preference gates it: cheers are always allowed; nudges still
 * require the recipient's `allowNudges`.
 */
export type HypeKind = 'cheer' | 'nudge';

export type Hype = {
  id: string;
  kind: HypeKind;
  emoji: string;
  /** Short label in the picker grid. */
  label: string;
  /** Push title (emoji included when rendered). */
  title: string;
  /** Push body; `{name}` is replaced with the sender's friendly name. */
  body: string;
};

export const HYPES: Hype[] = [
  // ---- Cheers (celebrate something they DID) ----
  { id: 'beast', kind: 'cheer', emoji: '💪', label: 'Beast mode', title: 'Beast mode', body: '{name} says beast mode 💪' },
  { id: 'fire', kind: 'cheer', emoji: '🔥', label: 'On fire', title: "You're on fire", body: '{name} says you are on fire 🔥' },
  { id: 'respect', kind: 'cheer', emoji: '🫡', label: 'Respect', title: 'Respect', body: '{name} respects the grind 🫡' },
  { id: 'letsgo', kind: 'cheer', emoji: '🚀', label: "Let's go", title: "LET'S GO", body: '{name} says LET’S GO 🚀' },
  { id: 'goat', kind: 'cheer', emoji: '🐐', label: 'GOAT', title: 'Certified GOAT', body: '{name} called you a GOAT 🐐' },
  { id: 'electric', kind: 'cheer', emoji: '⚡', label: 'Electric', title: 'Electric', body: '{name} says that was electric ⚡' },
  { id: 'champ', kind: 'cheer', emoji: '🏆', label: 'Champ', title: 'Champion', body: '{name} salutes the champ 🏆' },
  { id: 'cold', kind: 'cheer', emoji: '🧊', label: 'Ice cold', title: 'Ice cold', body: '{name} says ice cold execution 🧊' },

  // ---- Nudges (prod them to log — gated on allowNudges) ----
  { id: 'watching', kind: 'nudge', emoji: '👀', label: 'I see you', title: 'Someone is watching', body: '{name} is watching. Log today 👀' },
  { id: 'clock', kind: 'nudge', emoji: '⏰', label: "Clock's ticking", title: "Clock's ticking", body: '{name} says the clock is ticking ⏰' },
  { id: 'yourturn', kind: 'nudge', emoji: '🫵', label: 'Your turn', title: 'Your turn', body: '{name} says your turn — log something 🫵' },
];

export function hypeById(id?: string | null): Hype | null {
  if (!id) return null;
  return HYPES.find((h) => h.id === id) ?? null;
}

export function hypesOfKind(kind: HypeKind): Hype[] {
  return HYPES.filter((h) => h.kind === kind);
}
