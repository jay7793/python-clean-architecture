const exact = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'medium' })
const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
]

function relativeTo(iso: string, now: number): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000)
  const unit = UNITS.find(([, size]) => Math.abs(seconds) >= size)
  return unit ? relative.format(Math.round(seconds / unit[1]), unit[0]) : 'just now'
}

export function RelativeTime({ iso, now }: { iso: string; now: number }) {
  return (
    <time dateTime={iso} title={exact.format(new Date(iso))}>
      {relativeTo(iso, now)}
    </time>
  )
}
