export function formatYYYYMMDDLocal(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function todayYYYYMMDD() {
  return formatYYYYMMDDLocal(new Date());
}

export function yesterdayYYYYMMDD() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return formatYYYYMMDDLocal(d);
}

export function isValidYYYYMMDD(dateYYYYMMDD: string) {
  const s = (dateYYYYMMDD ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const dt = new Date(`${s}T00:00:00`);
  if (Number.isNaN(dt.valueOf())) return false;
  // Reject things like 2026-02-31 which JS normalizes to March.
  return formatYYYYMMDDLocal(dt) === s;
}

export function isFutureYYYYMMDD(dateYYYYMMDD: string) {
  const s = (dateYYYYMMDD ?? '').trim();
  if (!isValidYYYYMMDD(s)) return false;
  // Lexicographic comparison is safe for YYYY-MM-DD.
  return s > todayYYYYMMDD();
}

/**
 * Calculate week progress (0-1) where 0 = start of week (Monday), 1 = end of week (Sunday)
 * Returns how far through the current week we are
 */
export function getWeekProgress(): number {
  const now = new Date();
  const weekStart = new Date(now);
  // Get Monday of current week
  const dayOfWeek = weekStart.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Monday = 1, Sunday = 0
  weekStart.setDate(weekStart.getDate() + diff);
  weekStart.setHours(0, 0, 0, 0);
  
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  
  const totalMs = weekEnd.getTime() - weekStart.getTime();
  const elapsedMs = now.getTime() - weekStart.getTime();
  return Math.min(1, Math.max(0, elapsedMs / totalMs));
}

