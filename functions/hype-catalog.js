/**
 * Server mirror of src/services/hypeCatalog.ts — MUST stay in lockstep (same
 * ids, same copy), same discipline as the dual scorers.
 *
 * The client sends only a `hypeId`; the push copy is rendered HERE, so a
 * modified client cannot push arbitrary text to another user's device.
 */
const HYPES = [
  // ---- Cheers ----
  { id: 'beast', kind: 'cheer', emoji: '💪', label: 'Beast mode', title: 'Beast mode', body: '{name} says beast mode 💪' },
  { id: 'fire', kind: 'cheer', emoji: '🔥', label: 'On fire', title: "You're on fire", body: '{name} says you are on fire 🔥' },
  { id: 'respect', kind: 'cheer', emoji: '🫡', label: 'Respect', title: 'Respect', body: '{name} respects the grind 🫡' },
  { id: 'letsgo', kind: 'cheer', emoji: '🚀', label: "Let's go", title: "LET'S GO", body: '{name} says LET’S GO 🚀' },
  { id: 'goat', kind: 'cheer', emoji: '🐐', label: 'GOAT', title: 'Certified GOAT', body: '{name} called you a GOAT 🐐' },
  { id: 'electric', kind: 'cheer', emoji: '⚡', label: 'Electric', title: 'Electric', body: '{name} says that was electric ⚡' },
  { id: 'champ', kind: 'cheer', emoji: '🏆', label: 'Champ', title: 'Champion', body: '{name} salutes the champ 🏆' },
  { id: 'cold', kind: 'cheer', emoji: '🧊', label: 'Ice cold', title: 'Ice cold', body: '{name} says ice cold execution 🧊' },

  // ---- Nudges (still gated on the recipient's allowNudges) ----
  { id: 'watching', kind: 'nudge', emoji: '👀', label: 'I see you', title: 'Someone is watching', body: '{name} is watching. Log today 👀' },
  { id: 'clock', kind: 'nudge', emoji: '⏰', label: "Clock's ticking", title: "Clock's ticking", body: '{name} says the clock is ticking ⏰' },
  { id: 'yourturn', kind: 'nudge', emoji: '🫵', label: 'Your turn', title: 'Your turn', body: '{name} says your turn — log something 🫵' },
];

function hypeById(id) {
  if (!id || typeof id !== 'string') return null;
  return HYPES.find((h) => h.id === id) || null;
}

/**
 * Render a hype into push copy. Returns null when the id is unknown or its
 * kind doesn't match the queued type (so a client can't send a nudge dressed
 * as a cheer to bypass the allowNudges gate).
 */
function renderHype(id, type, senderName) {
  const h = hypeById(id);
  if (!h || h.kind !== type) return null;
  return {
    title: `${h.emoji} ${h.title}`,
    body: String(h.body).replace('{name}', senderName),
  };
}

module.exports = { HYPES, hypeById, renderHype };
