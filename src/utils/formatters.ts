export function friendlyNameFromDisplayName(raw?: string | null, fallbackUid?: string) {
  const t = (raw ?? '').trim();
  if (t) {
    // If the “display name” is actually an email, show a friendlier handle.
    const at = t.indexOf('@');
    if (at > 0) return t.slice(0, at);
    return t;
  }
  if (fallbackUid) return fallbackUid.slice(0, 6);
  return 'User';
}

export function formatHeightInches(inches?: number | null) {
  if (inches == null || !Number.isFinite(inches)) return '—';
  const total = Math.round(inches);
  const ft = Math.floor(total / 12);
  const inch = Math.abs(total % 12);
  return `${ft}'${inch}" (${total} in)`;
}

export function formatWeightLb(lb?: number | null) {
  if (lb == null || !Number.isFinite(lb)) return '—';
  // Keep up to 1 decimal if needed, otherwise show integer.
  const rounded = Math.round(lb * 10) / 10;
  const txt = Number.isInteger(rounded) ? String(rounded) : String(rounded);
  return `${txt} lb`;
}

