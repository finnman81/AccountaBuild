/**
 * Height entry in feet + inches. Storage stays total inches (users.height);
 * these convert between that and the two boxes people actually think in.
 * A single "inches" box got "5" from someone meaning five feet.
 */

/** 70 -> { ft: '5', inches: '10' }. Empty strings when unknown. */
export function splitInches(total: number | null | undefined): { ft: string; inches: string } {
  const n = Number(total);
  if (total == null || !Number.isFinite(n) || n <= 0) return { ft: '', inches: '' };
  let ft = Math.floor(n / 12);
  let inches = Math.round(n - ft * 12);
  if (inches === 12) {
    ft += 1;
    inches = 0;
  }
  return { ft: String(ft), inches: String(inches) };
}

/** ('5', '10') -> 70. Blank inches count as 0. Null when feet is blank or not a number. */
export function joinFeetInches(ft: string, inches: string): number | null {
  if (!ft.trim()) return null;
  const f = Number(ft);
  const i = inches.trim() ? Number(inches) : 0;
  if (!Number.isFinite(f) || !Number.isFinite(i)) return null;
  return f * 12 + i;
}

/** Validation message for a feet/inches pair, or null when fine. */
export function feetInchesError(ft: string, inches: string): string | null {
  if (!ft.trim()) return 'Height is required';
  const i = inches.trim() ? Number(inches) : 0;
  if (!Number.isFinite(i) || i < 0 || i >= 12) return 'Inches must be 0 to 11';
  const total = joinFeetInches(ft, inches);
  if (total == null) return 'Height must be a number';
  if (total < 48 || total > 90) return 'Height must be between 4\'0" and 7\'6"';
  return null;
}
