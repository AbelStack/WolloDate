export default function CreatorBadge({ size = 'sm', className = '' }) {
  const sizeMap = {
    xs: 'text-[9px] px-1.5 py-0.5',
    sm: 'text-[10px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
  }

  const sizeClass = sizeMap[size] || sizeMap.sm

  return (
    <span
      className={`inline-flex items-center rounded-full border border-amber-400/35 bg-amber-500/15 font-semibold uppercase tracking-wide text-amber-200 ${sizeClass} ${className}`}
      title="Creator of WolloDate"
      aria-label="Creator of WolloDate"
    >
      Creator of WolloDate
    </span>
  )
}
