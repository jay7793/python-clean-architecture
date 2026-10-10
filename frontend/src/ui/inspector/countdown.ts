/** Time left to an expiry as "6d 23h 59m 41s", dropping leading units that are zero but always keeping minutes and seconds. */
export function countdown(expiresAtSeconds: number, nowMs: number): string {
  const left = Math.floor(expiresAtSeconds - nowMs / 1000)
  if (left <= 0) return 'expired'
  const units = [
    [Math.floor(left / 86_400), 'd'],
    [Math.floor((left % 86_400) / 3_600), 'h'],
    [Math.floor((left % 3_600) / 60), 'm'],
    [left % 60, 's'],
  ] as const
  const first = units.findIndex(([value], index) => value > 0 || index >= 2)
  return units
    .slice(first)
    .map(([value, unit]) => `${value}${unit}`)
    .join(' ')
}
