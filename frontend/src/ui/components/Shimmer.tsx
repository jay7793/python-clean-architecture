/** A bar of a real load in progress. Only loading shimmers; placeholders for absent sections stay still. */
export function ShimmerBar({ className }: { className: string }) {
  return (
    <span className={`relative block overflow-hidden rounded-full bg-g100 ${className}`}>
      <span className="absolute inset-0 -translate-x-full animate-shimmer bg-linear-to-r from-transparent via-white/80 to-transparent" />
    </span>
  )
}
