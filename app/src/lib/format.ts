export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`;
}

/** 3725000 -> "1h 02m 05s"; set `short` to drop seconds. */
export function formatDuration(ms: number, short = false): string {
  const totalS = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(totalS / 3600);
  const m = Math.floor((totalS % 3600) / 60);
  const s = totalS % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  if (short) return h ? `${h}h ${mm}m` : `${m} min`;
  return h ? `${h}h ${mm}m ${String(s).padStart(2, '0')}s` : `${m}m ${String(s).padStart(2, '0')}s`;
}

export function scenicLabel(score: number): string {
  if (score >= 75) return 'Epic';
  if (score >= 55) return 'Twisty';
  if (score >= 35) return 'Scenic';
  return 'Cruisy';
}
