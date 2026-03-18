import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2 } from 'lucide-react'
import VerifiedBadge from '../components/VerifiedBadge'
import { stories } from '../api'

const getAvatarUrl = (u) => {
  if (u?.avatar_url) return u.avatar_url
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(u?.name || 'U')}&background=374151&color=fff`
}

export default function StoryDetail() {
  const navigate = useNavigate()
  const { storyId } = useParams()
  const [story, setStory] = useState(null)
  const [owner, setOwner] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadStory = async () => {
      try {
        setLoading(true)
        setError('')
        const res = await stories.getById(storyId)
        setStory(res.data?.story || null)
        setOwner(res.data?.user || null)
      } catch (err) {
        setError(err.response?.data?.message || 'Story not available')
      } finally {
        setLoading(false)
      }
    }

    loadStory()
  }, [storyId])

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="sticky top-0 bg-black border-b border-gray-800 px-4 h-14 flex items-center gap-3 z-20">
        <button onClick={() => navigate(-1)} className="hover:opacity-60 text-white">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-lg font-semibold">Mentioned Story</h1>
      </div>

      <div className="max-w-xl mx-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-7 h-7 animate-spin text-gray-400" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 text-sm text-gray-300">
            {error}
          </div>
        ) : story ? (
          <div className="rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden">
            <div className="flex items-center gap-3 p-4">
              <img src={getAvatarUrl(owner)} alt={owner?.name} className="w-10 h-10 rounded-full object-cover" />
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <p className="text-sm font-semibold truncate">{owner?.name}</p>
                  {owner?.is_approved && <VerifiedBadge size="xs" />}
                </div>
                <p className="text-xs text-gray-500">@{owner?.username}</p>
              </div>
            </div>

            {story.media_type === 'video' ? (
              <video
                src={stories.getMediaUrl(story.id)}
                className="w-full max-h-[70vh] object-contain bg-black"
                controls
                playsInline
              />
            ) : (
              <img src={stories.getMediaUrl(story.id)} alt="Mentioned story" className="w-full max-h-[70vh] object-contain bg-black" />
            )}

            {story.repost?.from_user && (
              <div className="px-4 pt-3 text-xs text-cyan-300">
                Reposted from @{story.repost.from_user.username}
              </div>
            )}

            {story.caption && (
              <div className="p-4 text-sm text-gray-200 whitespace-pre-wrap">
                {story.caption}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
