const dateTime = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'medium' })

export function Timestamp({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} title={iso}>
      {dateTime.format(new Date(iso))}
    </time>
  )
}
