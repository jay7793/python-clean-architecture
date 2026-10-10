import type { ReactNode } from 'react'

export function FieldList({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl>
      {rows.map(([term, value]) => (
        <div className="grid gap-0.5 border-b border-rule py-3.5 last:border-0 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-4" key={term}>
          <dt className="text-ink-3">{term}</dt>
          <dd className="break-words tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
