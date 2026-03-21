import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { stories } from '../api'
import { Plus, Loader2 } from 'lucide-react'
import StoryViewer from './StoryViewer'
import StoryUpload from './StoryUpload'
import { getAvatarUrl } from '../utils/avatar'

export default function StoriesBar() {
  const { user } = useAuth()
  const [storiesByUser, setStoriesByUser] = useState([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [viewingUser, setViewingUser] = useState(null)
  const [viewingIndex, setViewingIndex] = useState(0)
  const [viewedOrder, setViewedOrder] = useState([])

  useEffect(() => {
    loadStories()
  }, [])

  const loadStories = async () => {
    try {
      setLoading(true)
      const res = await stories.getAll()
      setStoriesByUser(res.data || [])
    } catch (err) {
      console.error('Failed to load stories:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleStoryClick = (userStory, index = 0) => {
    setViewingUser(userStory)
    setViewingIndex(index)
  }

  const getStartIndex = (userStory) => {
    const idx = (userStory?.stories || []).findIndex((story) => !story.is_viewed)
    return idx >= 0 ? idx : 0
  }

  const handleStoryViewed = useCallback((storyId, userId) => {
    const storyIdStr = String(storyId)
    const userIdStr = String(userId)

    setStoriesByUser((prev) => prev.map((storyGroup) => {
      if (String(storyGroup.user.id) !== userIdStr) return storyGroup

      const nextStories = (storyGroup.stories || []).map((story) => (
        String(story.id) === storyIdStr
          ? { ...story, is_viewed: true }
          : story
      ))

      return {
        ...storyGroup,
        stories: nextStories,
        has_unviewed: nextStories.some((story) => !story.is_viewed)
      }
    }))
  }, [])

  const handleStoryDeleted = useCallback((storyId, userId) => {
    const storyIdStr = String(storyId)
    const userIdStr = String(userId)

    setStoriesByUser((prev) => prev.reduce((nextGroups, storyGroup) => {
      if (String(storyGroup.user.id) !== userIdStr) {
        nextGroups.push(storyGroup)
        return nextGroups
      }

      const nextStories = (storyGroup.stories || []).filter(
        (story) => String(story.id) !== storyIdStr
      )

      if (nextStories.length === 0) {
        return nextGroups
      }

      nextGroups.push({
        ...storyGroup,
        stories: nextStories,
        has_unviewed: nextStories.some((story) => !story.is_viewed)
      })

      return nextGroups
    }, []))
  }, [])

  const handleCloseViewer = () => {
    if (viewingUser?.user?.id) {
      const viewedUserId = String(viewingUser.user.id)

      // Keep a simple viewing order so recently opened stories move to the end.
      setViewedOrder(prev => {
        const next = prev.filter(id => id !== viewedUserId)
        next.push(viewedUserId)
        return next
      })
    }

    setViewingUser(null)
    setViewingIndex(0)
  }

  const handleUploadComplete = () => {
    setShowUpload(false)
    loadStories()
  }

  const currentUserStory = storiesByUser.find(s => s.user.id === user?.id)
  const otherStories = storiesByUser
    .filter(s => s.user.id !== user?.id)
    .sort((a, b) => {
      // Unviewed stories first.
      if (Boolean(a.has_unviewed) !== Boolean(b.has_unviewed)) {
        return a.has_unviewed ? -1 : 1
      }

      const aOrder = viewedOrder.indexOf(a.user.id)
      const bOrder = viewedOrder.indexOf(b.user.id)

      if (aOrder === -1 && bOrder === -1) return 0
      if (aOrder === -1) return -1
      if (bOrder === -1) return 1

      return aOrder - bOrder
    })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <>
      {/* Stories Bar */}
      <div className="bg-black border-b border-gray-800 overflow-x-auto scrollbar-hide">
        <div className="flex gap-3 px-4 py-3">
          {/* Add Story / My Story */}
          <div className="flex flex-col items-center shrink-0">
            <div className="relative">
              {currentUserStory ? (
                // Show my story with ring
                <button
                  onClick={() => handleStoryClick(currentUserStory, Math.max(0, (currentUserStory.stories?.length || 1) - 1))}
                  className="w-16 h-16 rounded-full p-0.5 bg-linear-to-tr from-blue-400 via-cyan-500 to-blue-600"
                >
                  <img
                    src={getAvatarUrl(currentUserStory.user)}
                    alt={currentUserStory.user.name}
                    className="w-full h-full rounded-full object-cover border-2 border-black"
                    style={{ aspectRatio: '1 / 1' }}
                  />
                </button>
              ) : (
                // Show add story button
                <button
                  onClick={() => setShowUpload(true)}
                  className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center"
                >
                  <img
                    src={getAvatarUrl(user)}
                    alt={user?.name}
                    className="w-full h-full rounded-full object-cover opacity-60"
                    style={{ aspectRatio: '1 / 1' }}
                  />
                </button>
              )}
              {/* Plus button overlay */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setShowUpload(true)
                }}
                className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center border-2 border-black"
              >
                <Plus className="w-3 h-3 text-white" />
              </button>
            </div>
            <span className="text-xs text-gray-400 mt-1 truncate w-16 text-center">
              {currentUserStory ? 'Your story' : 'Add story'}
            </span>
          </div>

          {/* Other Users' Stories */}
          {otherStories.map((userStory) => (
            <button
              key={userStory.user.id}
              onClick={() => handleStoryClick(userStory, getStartIndex(userStory))}
              className="flex flex-col items-center shrink-0"
            >
              <div
                className={`w-16 h-16 rounded-full ${userStory.has_unviewed ? 'p-0.5 bg-linear-to-tr from-blue-400 via-cyan-500 to-blue-600' : ''}`}
              >
                <img
                  src={getAvatarUrl(userStory.user)}
                  alt={userStory.user.name}
                  className={`w-full h-full rounded-full object-cover ${userStory.has_unviewed ? 'border-2 border-black' : ''}`}
                  style={{ aspectRatio: '1 / 1' }}
                />
              </div>
              <span className="text-xs text-gray-400 mt-1 truncate w-16 text-center">
                {userStory.user.username || userStory.user.name.split(' ')[0]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Story Viewer Modal */}
      {viewingUser && (
        <StoryViewer
          userStories={storiesByUser}
          initialUserIndex={Math.max(0, storiesByUser.findIndex(s => String(s.user.id) === String(viewingUser.user.id)))}
          initialStoryIndex={viewingIndex}
          onStoryViewed={handleStoryViewed}
          onStoryDeleted={handleStoryDeleted}
          onClose={handleCloseViewer}
          currentUserId={user?.id}
        />
      )}

      {/* Story Upload Modal */}
      {showUpload && (
        <StoryUpload
          onClose={() => setShowUpload(false)}
          onComplete={handleUploadComplete}
        />
      )}
    </>
  )
}
