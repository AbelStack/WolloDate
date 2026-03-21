import logoImg from '../assets/logo.jpg'

export default function Logo({ size = 'md', showName = true }) {
  const sizeMap = {
    sm: 'h-8',
    md: 'h-12',
    lg: 'h-16',
    xl: 'h-20'
  }

  const textSizeMap = {
    sm: 'text-lg',
    md: 'text-xl',
    lg: 'text-2xl',
    xl: 'text-3xl'
  }

  return (
    <div className="flex items-center gap-2">
      <img
        src={logoImg}
        alt="WolloDate Logo"
        className={`${sizeMap[size]} w-auto object-contain`}
        style={{ borderRadius: '20%' }}
      />
      {showName && (
        <span className={`${textSizeMap[size]} font-bold tracking-tight`} style={{ color: 'var(--color-text-primary)' }}>
          WolloDate
        </span>
      )}
    </div>
  )
}
