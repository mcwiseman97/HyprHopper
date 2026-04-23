const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 60 * 60 * 24 * 365],
  ['month', 60 * 60 * 24 * 30],
  ['week', 60 * 60 * 24 * 7],
  ['day', 60 * 60 * 24],
  ['hour', 60 * 60],
  ['minute', 60],
  ['second', 1],
];

export function relativeTime(isoString: string): string {
  const then = new Date(isoString).getTime();
  if (Number.isNaN(then)) return '';
  const diffSec = Math.round((then - Date.now()) / 1000);
  const absSec = Math.abs(diffSec);
  for (const [unit, secondsPerUnit] of UNITS) {
    if (absSec >= secondsPerUnit || unit === 'second') {
      const v = Math.round(diffSec / secondsPerUnit);
      return rtf.format(v, unit);
    }
  }
  return rtf.format(diffSec, 'second');
}
