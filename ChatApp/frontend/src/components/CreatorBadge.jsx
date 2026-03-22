export default function CreatorBadge({ size = 'compact', className = '' }) {
  const sizeMap = {
    compact: 'text-[8px] px-1 py-0.5 h-4 min-w-[60px]',
    xxs: 'text-[8px] px-1 py-0.5',
    xs: 'text-[9px] px-1.5 py-0.5',
    sm: 'text-[10px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
  };
  const sizeClass = sizeMap[size] || sizeMap.compact;
  return (
    <span
      className={`inline-flex shrink-0 whitespace-nowrap items-center rounded-full font-semibold uppercase tracking-wide ${sizeClass} ${className} dark:border-amber-400/35 dark:bg-amber-500/15 dark:text-amber-200 light:border-black/20 light:bg-black light:text-white`}
      style={{ lineHeight: '1', verticalAlign: 'middle' }}
      title="Creator of WolloGram"
      aria-label="Creator of WolloGram"
    >
      CREATOR OF WOLLOGRAM
    </span>
  );
}
