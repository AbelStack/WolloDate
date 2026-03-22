// Reusable skeleton loading components

export function Skeleton({ className = '', width = 'w-full', height = 'h-4' }) {
  return (
    <div 
      className={`animate-pulse bg-gray-800 rounded ${width} ${height} ${className}`}
      style={{ backgroundColor: 'var(--color-bg-card)' }}
    />
  )
}

export function PostSkeleton() {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4 mb-4 shadow-[0_12px_34px_rgba(0,0,0,0.35)]">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <Skeleton className="w-10 h-10 rounded-full" />
        <div className="flex-1">
          <Skeleton width="w-32" height="h-4" className="mb-2" />
          <Skeleton width="w-20" height="h-3" />
        </div>
      </div>
      
      {/* Caption */}
      <Skeleton width="w-full" height="h-4" className="mb-2" />
      <Skeleton width="w-3/4" height="h-4" className="mb-3" />
      
      {/* Image placeholder */}
      <Skeleton width="w-full" height="h-80" className="mb-3" />
      
      {/* Actions */}
      <div className="flex items-center gap-4">
        <Skeleton width="w-16" height="h-8" />
        <Skeleton width="w-16" height="h-8" />
        <Skeleton width="w-16" height="h-8" />
      </div>
    </div>
  )
}

export function ProfileSkeleton() {
  return (
    <div className="p-4 sm:p-6 pt-12 sm:pt-14">
      <div className="flex items-start gap-4 sm:gap-6">
        {/* Avatar */}
        <Skeleton className="w-20 h-20 sm:w-24 sm:h-24 rounded-full shrink-0" />
        
        {/* Stats */}
        <div className="flex-1">
          <Skeleton width="w-32" height="h-6" className="mb-2" />
          <Skeleton width="w-24" height="h-4" className="mb-3" />
          
          <div className="flex gap-6 mb-3">
            <Skeleton width="w-16" height="h-4" />
            <Skeleton width="w-20" height="h-4" />
            <Skeleton width="w-20" height="h-4" />
          </div>
          
          <div className="flex gap-2">
            <Skeleton width="w-24" height="h-9" />
            <Skeleton width="w-24" height="h-9" />
          </div>
        </div>
      </div>
      
      {/* Bio */}
      <Skeleton width="w-full" height="h-4" className="mt-4 mb-2" />
      <Skeleton width="w-2/3" height="h-4" />
    </div>
  )
}

export function ChatMessageSkeleton() {
  return (
    <div className="flex gap-2 mb-3">
      <Skeleton className="w-8 h-8 rounded-full shrink-0" />
      <div className="flex-1">
        <Skeleton width="w-32" height="h-3" className="mb-2" />
        <Skeleton width="w-48" height="h-10" className="rounded-2xl" />
      </div>
    </div>
  )
}

export function StorySkeleton() {
  return (
    <div className="flex flex-col items-center gap-1 shrink-0">
      <Skeleton className="w-16 h-16 sm:w-18 sm:h-18 rounded-full" />
      <Skeleton width="w-14" height="h-3" />
    </div>
  )
}

export function CommentSkeleton() {
  return (
    <div className="flex gap-2 mb-3">
      <Skeleton className="w-8 h-8 rounded-full shrink-0" />
      <div className="flex-1">
        <Skeleton width="w-24" height="h-3" className="mb-2" />
        <Skeleton width="w-full" height="h-4" className="mb-1" />
        <Skeleton width="w-3/4" height="h-4" />
      </div>
    </div>
  )
}

export function NotificationSkeleton() {
  return (
    <div className="flex items-center gap-3 p-4 border-b border-gray-800">
      <Skeleton className="w-12 h-12 rounded-full shrink-0" />
      <div className="flex-1">
        <Skeleton width="w-full" height="h-4" className="mb-2" />
        <Skeleton width="w-32" height="h-3" />
      </div>
    </div>
  )
}

export function SearchResultSkeleton() {
  return (
    <div className="flex items-center gap-3 p-3">
      <Skeleton className="w-12 h-12 rounded-full shrink-0" />
      <div className="flex-1">
        <Skeleton width="w-32" height="h-4" className="mb-1" />
        <Skeleton width="w-24" height="h-3" />
      </div>
    </div>
  )
}

export function ImageSkeleton({ className = '' }) {
  return (
    <div className={`relative overflow-hidden bg-gray-800 ${className}`}>
      <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-gray-700/50 to-transparent" 
        style={{
          backgroundSize: '200% 100%',
          animation: 'shimmer 2s infinite'
        }}
      />
    </div>
  )
}
