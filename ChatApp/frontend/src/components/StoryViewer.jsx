import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSocket } from '../context/useSocket'
import { stories, users, conversations, messages } from '../api'
import ConfirmDialog from './ConfirmDialog'
import { SHARED_STORY_MESSAGE } from '../utils/chatShares'
import { getAvatarUrl } from '../utils/avatar'
import { X, ChevronLeft, ChevronRight, Eye, Trash2, Loader2, Heart, Send, Repeat2, Share2, Link as LinkIcon, MoreVertical, Pencil } from 'lucide-react'
import VerifiedBadge from './VerifiedBadge'

const renderTextWithMentions = (text, onMentionClick) => {
  const content = String(text || '')
  const parts = content.split(/(@[A-Za-z0-9_]{3,30})/g)

  return parts.map((part, idx) => {
    if (/^@[A-Za-z0-9_]{3,30}$/.test(part)) {
      return (
        <button
          key={`mention-${idx}`}
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onMentionClick(part.slice(1))
          }}
          className="text-cyan-300 font-medium hover:text-cyan-200 underline"
        >
          {part}
        </button>
      )
    }

    return <span key={`text-${idx}`}>{part}</span>
  })
}

export default function StoryViewer({
  userStories,
  initialUserIndex = 0,
  initialStoryIndex = 0,
  onStoryViewed,
  onStoryDeleted,
  onClose,
  currentUserId
}) {
  const navigate = useNavigate()
  const { emitNewMessage, refreshNotificationCounts } = useSocket()
  const [currentUserIndex, setCurrentUserIndex] = useState(Math.max(0, initialUserIndex || 0))
  const [currentStoryIndex, setCurrentStoryIndex] = useState(Math.max(0, initialStoryIndex || 0))
  const [progress, setProgress] = useState(0)
  const [paused, setPaused] = useState(false)
  const [showViewers, setShowViewers] = useState(false)
  const [viewers, setViewers] = useState([])
  const [loadingViewers, setLoadingViewers] = useState(false)
  const [mediaLoaded, setMediaLoaded] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [sendingReply, setSendingReply] = useState(false)
  const [liked, setLiked] = useState(false)
  const [likeAnimating, setLikeAnimating] = useState(false)
  const [repostingStory, setRepostingStory] = useState(false)
  const [replyFocused, setReplyFocused] = useState(false)
  const [sharingStory, setSharingStory] = useState(false)
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [chatList, setChatList] = useState([])
  const [loadingChats, setLoadingChats] = useState(false)
  const [sendingTo, setSendingTo] = useState(null)
  const [shareSearch, setShareSearch] = useState('')
  const [editedCaptions, setEditedCaptions] = useState({})
  // Inline edit/repost state
  const [editingCaption, setEditingCaption] = useState(false)
  const [editingCaptionValue, setEditingCaptionValue] = useState('')
  const [editingCaptionLoading, setEditingCaptionLoading] = useState(false)
  const [repostingCaption, setRepostingCaption] = useState(false)
  const [repostCaptionValue, setRepostCaptionValue] = useState('')
  const [repostCaptionLoading, setRepostCaptionLoading] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletingStory, setDeletingStory] = useState(false)
  
  const progressInterval = useRef(null)
  const videoRef = useRef(null)
  const replyInputRef = useRef(null)
  const mentionUserCacheRef = useRef(new Map())
  const storyDuration = 5000 // 5 seconds for images

  const currentUserStory = userStories[currentUserIndex]
  const currentStory = currentUserStory?.stories[currentStoryIndex]
  const isOwnStory = currentUserStory?.user.id === currentUserId
  const effectiveCaption = currentStory ? (editedCaptions[currentStory.id] ?? currentStory.caption) : ''
  const mediaSrc = currentStory ? stories.getMediaUrl(currentStory.id) : null
  const isInteractionLocked = showViewers || replyFocused || sharingStory || shareModalOpen || editingCaption || repostingCaption

  useEffect(() => {
    if (!Array.isArray(userStories) || userStories.length === 0) return

    if (!userStories[currentUserIndex]) {
      setCurrentUserIndex(0)
      setCurrentStoryIndex(0)
      return
    }

    const storiesOfCurrentUser = userStories[currentUserIndex]?.stories || []
    if (!storiesOfCurrentUser[currentStoryIndex]) {
      setCurrentStoryIndex(0)
    }
  }, [userStories, currentUserIndex, currentStoryIndex])



  // Mark story as viewed
  useEffect(() => {
    if (currentStory && !isOwnStory && !currentStory.is_viewed) {
      onStoryViewed?.(currentStory.id, currentUserStory?.user?.id)
      stories.view(currentStory.id).catch(console.error)
    }
  }, [currentStory?.id, currentStory?.is_viewed, currentUserStory?.user?.id, isOwnStory, onStoryViewed])

  // Sync liked state when story changes
  useEffect(() => {
    setLiked(currentStory?.is_liked || false)
    setReplyText('')
  }, [currentStory?.id])

  // Reset media state when story changes
  useEffect(() => {
    if (!currentStory) return
    setMediaLoaded(false)
    if (videoRef.current) videoRef.current.pause()
  }, [currentStory?.id])

  // Progress timer
  const startProgress = useCallback(() => {
    if (progressInterval.current) {
      clearInterval(progressInterval.current)
    }

    setProgress(0)
    const increment = 100 / (storyDuration / 50) // Update every 50ms

    progressInterval.current = setInterval(() => {
      if (!paused && !isInteractionLocked) {
        setProgress(prev => {
          if (prev >= 100) {
            goToNextStory()
            return 0
          }
          return prev + increment
        })
      }
    }, 50)
  }, [paused, isInteractionLocked])

  useEffect(() => {
    if (mediaLoaded && currentStory?.media_type === 'image') {
      startProgress()
    }
    return () => {
      if (progressInterval.current) {
        clearInterval(progressInterval.current)
      }
    }
  }, [mediaLoaded, currentStoryIndex, currentUserIndex, startProgress])

  // Video handling
  useEffect(() => {
    if (currentStory?.media_type === 'video' && videoRef.current && mediaSrc) {
      videoRef.current.currentTime = 0
      const playPromise = videoRef.current.play()
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          // Ignore AbortError — expected when media is removed during navigation
          if (err.name !== 'AbortError') console.error(err)
        })
      }
    }
  }, [currentStory?.id, mediaSrc])

  const handleImageLoad = () => {
    setMediaLoaded(true)
  }

  const handleVideoTimeUpdate = () => {
    if (videoRef.current) {
      const percent = (videoRef.current.currentTime / videoRef.current.duration) * 100
      setProgress(percent)
    }
  }

  const handleVideoEnded = () => {
    if (isInteractionLocked) return
    goToNextStory()
  }

  const goToNextStory = () => {
    if (!currentUserStory) return

    // Next story in current user's stories
    if (currentStoryIndex < currentUserStory.stories.length - 1) {
      setCurrentStoryIndex(prev => prev + 1)
      setMediaLoaded(false)
    }
    // Next user's stories
    else if (currentUserIndex < userStories.length - 1) {
      setCurrentUserIndex(prev => prev + 1)
      setCurrentStoryIndex(0)
      setMediaLoaded(false)
    }
    // End of all stories
    else {
      onClose()
    }
  }

  const goToPrevStory = () => {
    // Previous story in current user's stories
    if (currentStoryIndex > 0) {
      setCurrentStoryIndex(prev => prev - 1)
      setMediaLoaded(false)
    }
    // Previous user's stories
    else if (currentUserIndex > 0) {
      const prevUser = userStories[currentUserIndex - 1]
      setCurrentUserIndex(prev => prev - 1)
      setCurrentStoryIndex(prevUser.stories.length - 1)
      setMediaLoaded(false)
    }
  }

  const handleTap = (e) => {
    if (isInteractionLocked) return

    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const width = rect.width

    if (x < width / 3) {
      goToPrevStory()
    } else if (x > (width * 2) / 3) {
      goToNextStory()
    }
  }

  const handleHold = () => {
    if (isInteractionLocked) return
    setPaused(true)
    if (videoRef.current) videoRef.current.pause()
  }

  const handleRelease = () => {
    if (isInteractionLocked) return
    setPaused(false)
    if (videoRef.current) {
      videoRef.current.play().catch(err => {
        if (err.name !== 'AbortError') console.error(err)
      })
    }
  }

  const closeViewersModal = () => {
    setShowViewers(false)
    if (!replyFocused && !sharingStory && !shareModalOpen) {
      setPaused(false)
    }
    if (videoRef.current) {
      videoRef.current.play().catch(err => {
        if (err.name !== 'AbortError') console.error(err)
      })
    }
  }

  const loadViewers = async () => {
    if (!isOwnStory || !currentStory) return
    
    try {
      setLoadingViewers(true)
      setPaused(true)
      if (videoRef.current) videoRef.current.pause()

      const res = await stories.getViewers(currentStory.id)
      const rawViewers = res.data.viewers || []
      const sortedViewers = [...rawViewers].sort((a, b) => {
        if (a.has_liked === b.has_liked) {
          const aTime = new Date(a.viewed_at || 0).getTime()
          const bTime = new Date(b.viewed_at || 0).getTime()
          return bTime - aTime
        }
        return a.has_liked ? -1 : 1
      })
      setViewers(sortedViewers)
      setShowViewers(true)
    } catch (err) {
      console.error('Failed to load viewers:', err)
    } finally {
      setLoadingViewers(false)
    }
  }

  const handleDelete = async () => {
    if (!isOwnStory || !currentStory || deletingStory) return

    const deletedStoryId = currentStory.id
    const deletedStoryOwnerId = currentUserStory.user.id
    const wasOnlyStoryForUser = currentUserStory.stories.length === 1
    const wasLastStoryForUser = currentStoryIndex >= currentUserStory.stories.length - 1

    const finalizeDeletedStory = () => {
      onStoryDeleted?.(deletedStoryId, deletedStoryOwnerId)

      if (wasOnlyStoryForUser) {
        onClose()
        return
      }

      if (wasLastStoryForUser) {
        setCurrentStoryIndex((prev) => Math.max(0, prev - 1))
      }
    }

    try {
      setDeletingStory(true)
      await stories.delete(deletedStoryId)
      finalizeDeletedStory()
    } catch (err) {
      console.error('Failed to delete story:', err)
      const status = err?.response?.status
      const serverMsg = err?.response?.data?.message

      // If backend says the story wasn't found, treat as deleted (it may have been removed server-side)
      if (status === 404) {
        console.warn('Story not found on server; treating as deleted')
        finalizeDeletedStory()
        return
      }

      if (serverMsg) {
        alert(`Failed to delete story: ${serverMsg}`)
      } else if (err?.response) {
        alert(`Failed to delete story: ${err.response.status} ${err.response.statusText}`)
      } else {
        alert(`Failed to delete story: ${err?.message || 'Unknown error'}`)
      }
    } finally {
      setDeletingStory(false)
      setShowDeleteConfirm(false)
    }
  }

  const handleEditCaption = () => {
    if (!isOwnStory || !currentStory) return
    setEditingCaptionValue(effectiveCaption || '')
    setEditingCaption(true)
  }

  const handleEditCaptionSave = async () => {
    if (!isOwnStory || !currentStory) return
    setEditingCaptionLoading(true)
    try {
      const res = await stories.update(currentStory.id, { caption: editingCaptionValue.trim() || null })
      const updatedCaption = res.data?.story?.caption ?? (editingCaptionValue.trim() || null)
      setEditedCaptions((prev) => ({ ...prev, [currentStory.id]: updatedCaption }))
      setEditingCaption(false)
    } catch (err) {
      console.error('Failed to update story caption:', err)
      // Optionally show a toast or error UI
    } finally {
      setEditingCaptionLoading(false)
    }
  }

  const handleEditCaptionCancel = () => {
    setEditingCaption(false)
    setEditingCaptionValue('')
  }

  const toggleLike = async () => {
    if (!currentStory || isOwnStory) return
    const wasLiked = liked
    setLiked(!wasLiked)
    setLikeAnimating(true)
    setTimeout(() => setLikeAnimating(false), 400)

    try {
      if (wasLiked) {
        await stories.unlike(currentStory.id)
      } else {
        await stories.like(currentStory.id)
      }
    } catch (err) {
      setLiked(wasLiked) // revert on failure
      console.error('Failed to toggle like:', err)
    }
  }

  const sendReply = async (e) => {
    e.preventDefault()
    if (!replyText.trim() || !currentStory || isOwnStory || sendingReply) return

    setSendingReply(true)
    try {
      const res = await stories.reply(currentStory.id, replyText.trim())
      const conversationId = res.data?.conversation_id
      const newMessage = res.data?.data

      if (conversationId && newMessage) {
        emitNewMessage(conversationId, newMessage, [currentUserId, currentUserStory.user.id])
      }

      refreshNotificationCounts()
      setReplyText('')
      replyInputRef.current?.blur()
    } catch (err) {
      console.error('Failed to send reply:', err)
    } finally {
      setSendingReply(false)
    }
  }

  const handleMentionClick = async (rawUsername) => {
    const username = String(rawUsername || '').toLowerCase()
    if (!username) return

    const cachedId = mentionUserCacheRef.current.get(username)
    if (cachedId) {
      navigate(`/profile/${cachedId}`)
      return
    }

    try {
      const res = await users.search(username)
      const list = res.data?.users || []
      const exact = list.find((u) => String(u.username || '').toLowerCase() === username)
      const target = exact || list[0]
      if (!target?.id) return

      mentionUserCacheRef.current.set(username, target.id)
      navigate(`/profile/${target.id}`)
    } catch {
      // Silently ignore mention navigation errors.
    }
  }

  const handleRepostStory = () => {
    if (!currentStory?.is_mentioned_for_viewer || repostingStory) return
    setRepostCaptionValue('')
    setRepostingCaption(true)
  }

  const handleRepostCaptionSave = async () => {
    if (!currentStory?.is_mentioned_for_viewer || repostingStory) return
    setRepostCaptionLoading(true)
    setRepostingStory(true)
    try {
      await stories.repost(currentStory.id, repostCaptionValue.trim())
      setRepostingCaption(false)
      setRepostCaptionValue('')
      refreshNotificationCounts()
      // Optionally show a toast or success UI
    } catch (err) {
      // Optionally show a toast or error UI
    } finally {
      setRepostCaptionLoading(false)
      setRepostingStory(false)
    }
  }

  const handleRepostCaptionCancel = () => {
    setRepostingCaption(false)
    setRepostCaptionValue('')
  }

  const handleShareStory = async () => {
    if (!currentStory) return

    try {
      setSharingStory(true)
      setPaused(true)
      setShareSearch('')
      setShareModalOpen(true)
      setLoadingChats(true)

      const res = await conversations.list()
      setChatList(res.data.data || res.data || [])
    } catch {
      setChatList([])
      setShareModalOpen(true)
    } finally {
      setLoadingChats(false)
      setSharingStory(false)
    }
  }

  const closeShareModal = () => {
    setShareModalOpen(false)
    if (!showViewers && !replyFocused) {
      setPaused(false)
    }
  }

  const toMemberUser = (member) => member?.user || member

  const getConversationName = (conv) => {
    if (conv?.name) return conv.name
    const other = (conv.members || [])
      .map(toMemberUser)
      .find((m) => m?.id !== currentUserId)
    return other?.name || 'Chat'
  }

  const getConversationAvatar = (conv) => {
    if (conv?.avatar_url) return conv.avatar_url
    const other = (conv.members || [])
      .map(toMemberUser)
      .find((m) => m?.id !== currentUserId)
    return getAvatarUrl(other)
  }

  const handleSendToChat = async (convId) => {
    if (!currentStory || sendingTo) return

    try {
      setSendingTo(convId)
      const res = await messages.send(convId, {
        content: SHARED_STORY_MESSAGE,
        story_id: currentStory.id,
      })
      emitNewMessage(convId, res.data?.data, res.data?.member_ids || [])
      setShareModalOpen(false)
      setSendingTo(null)
      return
    } catch (err) {
      console.error('Failed to send story to chat:', err)
      setSendingTo(null)
      return
    }

    const shareUrl = `${window.location.origin}/story/${currentStory.id}`

    try {
      setSendingTo(convId)
      const shareText = `📸 Shared story from ${currentUserStory.user?.name || 'someone'}:\n${effectiveCaption || ''}\n${shareUrl}`
      await messages.send(convId, { content: shareText })
      setShareModalOpen(false)
      setSendingTo(null)
    } catch (err) {
      console.error('Failed to send story to chat:', err)
      setSendingTo(null)
    }
  }

  const sendSharedStoryToChat = async (convId) => {
    if (!currentStory || sendingTo) return

    try {
      setSendingTo(convId)
      const res = await messages.send(convId, {
        content: SHARED_STORY_MESSAGE,
        story_id: currentStory.id,
      })
      emitNewMessage(convId, res.data?.data, res.data?.member_ids || [])
      setShareModalOpen(false)
    } catch (err) {
      console.error('Failed to send story to chat:', err)
    } finally {
      setSendingTo(null)
    }
  }

  const handleQuickShareAction = async (action) => {
    if (!currentStory) return

    const shareUrl = `${window.location.origin}/story/${currentStory.id}`
    const shareTitle = `${currentUserStory?.user?.name || 'User'}'s story`
    const shareText = `Check out this story on WolloGram: ${shareUrl}`

    try {
      if (action === 'copy') {
        await navigator.clipboard.writeText(shareUrl)
        return
      }

      if (action === 'whatsapp') {
        window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank', 'noopener,noreferrer')
        return
      }

      if (action === 'email') {
        window.location.href = `mailto:?subject=${encodeURIComponent('Story from WolloGram')}&body=${encodeURIComponent(shareText)}`
        return
      }

      if (action === 'x') {
        window.open(`https://x.com/intent/post?text=${encodeURIComponent(shareText)}`, '_blank', 'noopener,noreferrer')
        return
      }

      if (navigator.share) {
        await navigator.share({
          title: shareTitle,
          text: 'Check out this story on WolloGram',
          url: shareUrl,
        })
        return
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl)
      }
    } catch {
      // User may cancel native share; do nothing.
    }
  }

  const filteredChats = chatList.filter((conv) => {
    if (!shareSearch.trim()) return true
    return getConversationName(conv).toLowerCase().includes(shareSearch.trim().toLowerCase())
  })

  const formatTime = (dateStr) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    return `${diffHours}h ago`
  }

  if (!currentStory) {
    return (
      <div className="fixed inset-0 bg-black z-60 flex items-center justify-center">
        <button onClick={onClose} className="text-white text-sm px-4 py-2 rounded-lg border border-gray-700 hover:bg-gray-900">
          Close
        </button>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black z-60 flex items-center justify-center">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 hidden md:inline-flex p-2 text-white hover:bg-white/10 rounded-full"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Navigation arrows (desktop) */}
      {currentUserIndex > 0 && (
        <button
          onClick={goToPrevStory}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-2 bg-white/10 hover:bg-white/20 rounded-full hidden md:block"
        >
          <ChevronLeft className="w-6 h-6 text-white" />
        </button>
      )}
      {currentUserIndex < userStories.length - 1 && (
        <button
          onClick={goToNextStory}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-2 bg-white/10 hover:bg-white/20 rounded-full hidden md:block"
        >
          <ChevronRight className="w-6 h-6 text-white" />
        </button>
      )}

      {/* Story Content */}
      <div
        className="relative w-full h-full max-w-md mx-auto flex flex-col"
        onClick={handleTap}
        onMouseDown={handleHold}
        onMouseUp={handleRelease}
        onMouseLeave={handleRelease}
        onTouchStart={handleHold}
        onTouchEnd={handleRelease}
      >
        {/* Progress bars */}
        <div className="absolute top-0 left-0 right-0 z-10 flex gap-1 p-2">
          {currentUserStory.stories.map((_, idx) => (
            <button
              key={idx}
              type="button"
              aria-label={`Story ${idx + 1}`}
              onClick={(e) => {
                e.stopPropagation()
                setCurrentStoryIndex(idx)
                setProgress(0)
                setMediaLoaded(false)
              }}
              className="flex-1 h-0.5 bg-gray-600 rounded overflow-hidden"
            >
              <div
                className="h-full bg-white transition-all"
                style={{
                  width:
                    idx < currentStoryIndex
                      ? '100%'
                      : idx === currentStoryIndex
                      ? `${progress}%`
                      : '0%',
                }}
              />
            </button>
          ))}
        </div>

        {/* Header */}
        <div className="absolute top-8 left-0 right-0 z-10 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                navigate(`/profile/${currentUserStory.user.id}`)
              }}
              className="flex items-center gap-3 hover:opacity-80"
            >
              <img
                src={getAvatarUrl(currentUserStory.user)}
                alt={currentUserStory.user.name}
                className="w-8 h-8 rounded-full object-cover border border-white/20 shrink-0"
                style={{ aspectRatio: '1 / 1' }}
              />
              <div className="flex items-center gap-1">
                <span className="text-white text-sm font-medium">
                  {currentUserStory.user.username || currentUserStory.user.name}
                </span>
                {currentUserStory.user.is_approved && (
                  <VerifiedBadge size="sm" />
                )}
              </div>
            </button>
            <span className="text-gray-400 text-xs">
              {formatTime(currentStory.created_at)}
            </span>
            <span className="text-gray-500 text-xs">
              {currentStoryIndex + 1}/{currentUserStory.stories.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleShareStory()
              }}
              className="p-2 hover:bg-white/10 rounded-full"
              title="Share story"
            >
              <Share2 className="w-5 h-5 text-white" />
            </button>

            {isOwnStory && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleEditCaption()
                  }}
                  className="p-2 hover:bg-white/10 rounded-full"
                  title="Edit caption"
                >
                  <Pencil className="w-5 h-5 text-white" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowDeleteConfirm(true)
                  }}
                  className="hidden md:inline-flex p-2 hover:bg-white/10 rounded-full"
                >
                  <Trash2 className="w-5 h-5 text-white" />
                </button>
              </>
            )}

            <button
              onClick={(e) => {
                e.stopPropagation()
                onClose()
              }}
              className="p-2 hover:bg-white/10 rounded-full md:hidden"
              title="Close story viewer"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        {/* Media */}
        <div className="flex-1 flex items-center justify-center">
          {currentStory.media_type === 'video' ? (
            <video
              ref={videoRef}
              src={mediaSrc}
                className="max-w-full max-h-[72vh] object-contain"
              onTimeUpdate={handleVideoTimeUpdate}
              onEnded={handleVideoEnded}
              onLoadedData={() => setMediaLoaded(true)}
              onError={() => setMediaLoaded(true)}
              playsInline
              muted={false}
            />
          ) : (
            <img
              src={mediaSrc}
              alt="Story"
              className="max-w-full max-h-[72vh] object-contain"
              onLoad={handleImageLoad}
              onError={() => setMediaLoaded(true)}
            />
          )}
          {!mediaLoaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-white" />
            </div>
          )}
        </div>

        {/* Caption at bottom, like social feed style */}
        {/* Inline edit caption for own story */}
        {(editingCaption && isOwnStory) ? (
          <div className={`absolute left-0 right-0 z-20 px-4 ${isOwnStory ? 'bottom-[calc(6.75rem+env(safe-area-inset-bottom))]' : 'bottom-[calc(7.5rem+env(safe-area-inset-bottom))]'}`}>
            <div className="max-w-md mx-auto">
              <div className="rounded-xl bg-black/70 backdrop-blur-sm px-3 py-2 flex flex-col gap-2">
                <textarea
                  className="w-full bg-black/40 border border-white/30 rounded px-3 py-2 text-white text-sm placeholder-gray-400 outline-none focus:border-white/60 resize-none max-h-32 overflow-y-auto"
                  value={editingCaptionValue}
                  onChange={e => setEditingCaptionValue(e.target.value)}
                  placeholder="Edit story caption (optional)"
                  maxLength={2200}
                  rows={1}
                  autoFocus
                  disabled={editingCaptionLoading}
                  onKeyDown={e => { 
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleEditCaptionSave()
                    }
                  }}
                  style={{
                    height: 'auto',
                    minHeight: '40px',
                  }}
                  onInput={(e) => {
                    e.target.style.height = 'auto'
                    e.target.style.height = e.target.scrollHeight + 'px'
                  }}
                />
                />
                <div className="flex gap-2 justify-end">
                  <button
                    className="px-3 py-1 rounded bg-gray-600 text-white text-xs hover:bg-gray-500 disabled:opacity-50"
                    onClick={handleEditCaptionCancel}
                    disabled={editingCaptionLoading}
                  >Cancel</button>
                  <button
                    className="px-3 py-1 rounded bg-blue-500 text-white text-xs hover:bg-blue-600 disabled:opacity-50"
                    onClick={handleEditCaptionSave}
                    disabled={editingCaptionLoading}
                  >{editingCaptionLoading ? 'Saving...' : 'Save'}</button>
                </div>
              </div>
            </div>
          </div>
        ) : (repostingCaption ? (
          <div className={`absolute left-0 right-0 z-20 px-4 ${isOwnStory ? 'bottom-[calc(6.75rem+env(safe-area-inset-bottom))]' : 'bottom-[calc(7.5rem+env(safe-area-inset-bottom))]'}`}>
            <div className="max-w-md mx-auto">
              <div className="rounded-xl bg-black/70 backdrop-blur-sm px-3 py-2 flex flex-col gap-2">
                <textarea
                  className="w-full bg-black/40 border border-white/30 rounded px-3 py-2 text-white text-sm placeholder-gray-400 outline-none focus:border-white/60 resize-none max-h-32 overflow-y-auto"
                  value={repostCaptionValue}
                  onChange={e => setRepostCaptionValue(e.target.value)}
                  placeholder="Add a caption to your repost (optional)"
                  maxLength={2200}
                  rows={1}
                  autoFocus
                  disabled={repostCaptionLoading}
                  onKeyDown={e => { 
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleRepostCaptionSave()
                    }
                  }}
                  style={{
                    height: 'auto',
                    minHeight: '40px',
                  }}
                  onInput={(e) => {
                    e.target.style.height = 'auto'
                    e.target.style.height = e.target.scrollHeight + 'px'
                  }}
                />
                />
                <div className="flex gap-2 justify-end">
                  <button
                    className="px-3 py-1 rounded bg-gray-600 text-white text-xs hover:bg-gray-500 disabled:opacity-50"
                    onClick={handleRepostCaptionCancel}
                    disabled={repostCaptionLoading}
                  >Cancel</button>
                  <button
                    className="px-3 py-1 rounded bg-blue-500 text-white text-xs hover:bg-blue-600 disabled:opacity-50"
                    onClick={handleRepostCaptionSave}
                    disabled={repostCaptionLoading}
                  >{repostCaptionLoading ? 'Reposting...' : 'Repost'}</button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          (currentStory.repost?.from_user || (effectiveCaption && effectiveCaption.trim())) && (
            <div className={`absolute left-0 right-0 z-20 px-4 ${isOwnStory ? 'bottom-[calc(6.75rem+env(safe-area-inset-bottom))]' : 'bottom-[calc(7.5rem+env(safe-area-inset-bottom))]'}`}>
              <div className="max-w-md mx-auto">
                <div className="rounded-xl bg-black/45 backdrop-blur-sm px-3 py-2">
                  {currentStory.repost?.from_user && (
                    <p className="text-xs text-cyan-300 mb-1">
                      Reposted from @{currentStory.repost.from_user.username}
                    </p>
                  )}
                  {effectiveCaption && effectiveCaption.trim() && (
                    <p className="text-sm text-white whitespace-pre-wrap wrap-break-word">{renderTextWithMentions(effectiveCaption, handleMentionClick)}</p>
                  )}
                </div>
              </div>
            </div>
          )
        ))}
      </div>

      {/* Reply bar + Like button (for non-own stories) — OUTSIDE the tap area */}
      {!isOwnStory && (
        <div className="absolute left-0 right-0 z-20 px-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))]"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 max-w-md mx-auto">
            <form onSubmit={sendReply} className="flex-1 relative">
              <textarea
                ref={replyInputRef}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onFocus={() => {
                  setReplyFocused(true)
                  setPaused(true)
                }}
                onBlur={() => {
                  setReplyFocused(false)
                  if (!showViewers && !sharingStory && !shareModalOpen) {
                    setPaused(false)
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    if (replyText.trim()) {
                      sendReply(e)
                    }
                  }
                }}
                placeholder={`Reply to ${currentUserStory.user.username || currentUserStory.user.name}...`}
                rows={1}
                className="w-full bg-black/60 backdrop-blur-sm border border-white/30 rounded-full px-4 py-2.5 pr-10 text-white text-sm placeholder-gray-400 outline-none focus:border-white/60 resize-none max-h-32 overflow-y-auto"
                style={{
                  height: 'auto',
                  minHeight: '40px',
                }}
                onInput={(e) => {
                  e.target.style.height = 'auto'
                  e.target.style.height = e.target.scrollHeight + 'px'
                }}
              />
              {replyText.trim() && (
                <button
                  type="submit"
                  disabled={sendingReply}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-white hover:text-blue-400 disabled:opacity-50"
                >
                  {sendingReply ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </button>
              )}
            </form>
            <button
              onClick={toggleLike}
              className={`p-2 transition-transform ${likeAnimating ? 'scale-125' : 'scale-100'}`}
            >
              <Heart
                className={`w-7 h-7 transition-colors ${liked ? 'text-red-500 fill-red-500' : 'text-white'}`}
              />
            </button>
            {currentStory?.is_mentioned_for_viewer && (
              <button
                onClick={handleRepostStory}
                disabled={repostingStory}
                className="p-2 text-white hover:text-cyan-300 disabled:opacity-50"
                title="Repost this mentioned story"
              >
                {repostingStory ? <Loader2 className="w-6 h-6 animate-spin" /> : <Repeat2 className="w-6 h-6" />}
              </button>
            )}
          </div>
        </div>
      )}

      {/* View count bar for own stories — OUTSIDE the tap area */}
      {isOwnStory && (
        <div className="absolute left-0 z-20 px-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))]"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          <button
            onClick={(e) => {
              e.stopPropagation()
              loadViewers()
            }}
            className="flex items-center gap-2 py-2 text-white/80 hover:text-white"
          >
            <Eye className="w-5 h-5" />
            <span className="text-sm">{currentStory.view_count ?? 0}</span>
          </button>
        </div>
      )}

      {isOwnStory && (
        <div className="absolute right-0 z-20 px-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:hidden"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowDeleteConfirm(true)
            }}
            className="flex items-center justify-center p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full"
            title="Delete story"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Viewers Modal */}
      {showViewers && (
        <div
          className="absolute inset-0 bg-black/80 z-20 flex items-end md:items-center justify-center p-0 md:p-6"
          onClick={closeViewersModal}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          <div
            className="bg-[#1f232e] w-full h-[88vh] md:h-auto md:max-w-140 rounded-t-2xl md:rounded-3xl md:max-h-[70vh] flex flex-col min-h-0 overflow-hidden border border-gray-800/80 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
          >
            <div className="hidden md:flex p-4 border-b border-gray-800/80 items-center justify-between">
              <button
                type="button"
                onClick={closeViewersModal}
                className="p-1.5 rounded-full hover:bg-gray-800 text-white"
                aria-label="Close viewers"
              >
                <X className="w-5 h-5" />
              </button>
              <h3 className="text-white font-semibold">Viewers</h3>
              <span className="text-gray-400 text-sm w-10 text-right">{viewers.length}</span>
            </div>

            <div className="md:hidden border-b border-gray-800/80 p-4">
              <div className="w-10 h-1 rounded-full bg-gray-600 mx-auto mb-3" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-white">
                  <Eye className="w-4 h-4" />
                  <span className="text-lg font-semibold">{viewers.length}</span>
                </div>
                <button
                  type="button"
                  onClick={closeViewersModal}
                  className="p-2 rounded-full hover:bg-gray-800 text-white"
                  aria-label="Close viewers"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <h3 className="mt-3 text-white text-2xl font-semibold">Who viewed your story</h3>
            </div>

            <div className="overflow-y-auto flex-1 min-h-0 overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
              {loadingViewers ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : viewers.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  No viewers yet
                </div>
              ) : (
                viewers.map((view) => (
                  <div
                    key={view.user.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-800/70"
                  >
                    <div className="relative">
                      <img
                        src={getAvatarUrl(view.user)}
                        alt={view.user.name}
                        className="w-11 h-11 rounded-full object-cover shrink-0"
                        style={{ aspectRatio: '1 / 1' }}
                      />
                      {view.has_liked && (
                        <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-pink-500 flex items-center justify-center">
                          <Heart className="w-3 h-3 text-white fill-white" />
                        </span>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-1 leading-none">
                        <span className="text-white font-semibold text-sm">{view.user.username || view.user.name}</span>
                        {view.user.is_approved && <VerifiedBadge size="sm" />}
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-gray-400 text-sm">{view.user.name}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-gray-400">
                      <button type="button" className="p-1.5 hover:text-white"><MoreVertical className="w-4 h-4" /></button>
                      <button type="button" className="p-1.5 hover:text-white"><Send className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Story Share Modal */}
      {shareModalOpen && (
        <div className="absolute inset-0 bg-black/80 z-30 flex items-end md:items-center justify-center p-0 md:p-6" onClick={closeShareModal}>
          <div className="w-full h-[88vh] md:h-auto md:max-w-175 rounded-t-2xl md:rounded-3xl bg-[#1f232e] border border-gray-800 overflow-hidden md:max-h-[78vh] flex flex-col min-h-0" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <button type="button" onClick={closeShareModal} className="p-1.5 rounded-full hover:bg-gray-800" aria-label="Close share modal">
                <X className="w-5 h-5 text-white" />
              </button>
              <h3 className="text-white font-semibold">Share</h3>
              <div className="w-8" />
            </div>

            <div className="p-4 border-b border-gray-800">
              <input
                type="text"
                value={shareSearch}
                onChange={(e) => setShareSearch(e.target.value)}
                placeholder="Search"
                className="w-full px-4 py-2.5 bg-gray-800/90 border border-gray-700 text-white rounded-xl"
              />
            </div>

            <div className="hidden md:flex flex-col min-h-0 flex-1">
              <div className="overflow-y-auto flex-1 min-h-0 p-5">
                {loadingChats ? (
                  <div className="py-10 flex justify-center">
                    <Loader2 className="animate-spin text-gray-400" />
                  </div>
                ) : filteredChats.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-500">No chats found</p>
                ) : (
                  <div className="grid grid-cols-4 gap-x-5 gap-y-6">
                    {filteredChats.map(conv => (
                      <button
                        key={conv.id}
                        type="button"
                        onClick={() => sendSharedStoryToChat(conv.id)}
                        disabled={Boolean(sendingTo)}
                        className="text-center disabled:opacity-60"
                      >
                        <div className="mx-auto w-18 h-18 rounded-full overflow-hidden border border-gray-700">
                          <img src={getConversationAvatar(conv)} alt="" className="w-full h-full object-cover" />
                        </div>
                        <p className="mt-2 text-sm text-gray-200 truncate">{getConversationName(conv)}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-gray-800 px-4 py-3 shrink-0">
                <div className="flex items-center gap-4 overflow-x-auto">
                  <button onClick={() => handleQuickShareAction('copy')} className="flex flex-col items-center gap-1.5 text-xs text-gray-200 min-w-16">
                    <span className="w-11 h-11 rounded-full bg-gray-800 flex items-center justify-center"><LinkIcon className="w-5 h-5" /></span>
                    Copy link
                  </button>
                  <button onClick={() => handleQuickShareAction('system')} className="flex flex-col items-center gap-1.5 text-xs text-gray-200 min-w-16">
                    <span className="w-11 h-11 rounded-full bg-gray-800 flex items-center justify-center"><Share2 className="w-5 h-5" /></span>
                    Share
                  </button>
                  <button onClick={() => handleQuickShareAction('whatsapp')} className="flex flex-col items-center gap-1.5 text-xs text-gray-200 min-w-16">
                    <span className="w-11 h-11 rounded-full bg-gray-800 flex items-center justify-center text-sm font-semibold">WA</span>
                    WhatsApp
                  </button>
                  <button onClick={() => handleQuickShareAction('email')} className="flex flex-col items-center gap-1.5 text-xs text-gray-200 min-w-16">
                    <span className="w-11 h-11 rounded-full bg-gray-800 flex items-center justify-center text-sm font-semibold">@</span>
                    Email
                  </button>
                  <button onClick={() => handleQuickShareAction('x')} className="flex flex-col items-center gap-1.5 text-xs text-gray-200 min-w-16">
                    <span className="w-11 h-11 rounded-full bg-gray-800 flex items-center justify-center text-sm font-semibold">X</span>
                    X
                  </button>
                </div>
              </div>
            </div>

            <div className="md:hidden flex flex-col min-h-0 flex-1">
              <div className="overflow-y-auto flex-1 min-h-0 p-4">
                {loadingChats ? (
                  <div className="py-10 flex justify-center">
                    <Loader2 className="animate-spin text-gray-400" />
                  </div>
                ) : filteredChats.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-500">No chats found</p>
                ) : (
                  <div className="grid grid-cols-3 gap-x-4 gap-y-6">
                    {filteredChats.slice(0, 12).map(conv => (
                      <button key={conv.id} type="button" onClick={() => sendSharedStoryToChat(conv.id)} disabled={Boolean(sendingTo)} className="text-center disabled:opacity-60">
                        <div className="mx-auto w-18 h-18 rounded-full overflow-hidden border border-gray-700">
                          <img src={getConversationAvatar(conv)} alt="" className="w-full h-full object-cover" />
                        </div>
                        <p className="mt-2 text-sm text-gray-200 truncate">{getConversationName(conv)}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-gray-800 px-3 py-2 shrink-0">
                <div className="flex items-center gap-3 overflow-x-auto">
                  <button onClick={() => handleQuickShareAction('copy')} className="flex flex-col items-center gap-1 text-xs text-gray-200 min-w-16">
                    <span className="w-11 h-11 rounded-full bg-gray-800 flex items-center justify-center"><LinkIcon className="w-5 h-5" /></span>
                    Copy link
                  </button>
                  <button onClick={() => handleQuickShareAction('whatsapp')} className="flex flex-col items-center gap-1 text-xs text-gray-200 min-w-16">
                    <span className="w-11 h-11 rounded-full bg-green-600 flex items-center justify-center text-sm font-semibold">WA</span>
                    WhatsApp
                  </button>
                  <button onClick={() => handleQuickShareAction('system')} className="flex flex-col items-center gap-1 text-xs text-gray-200 min-w-16">
                    <span className="w-11 h-11 rounded-full bg-gray-800 flex items-center justify-center"><Share2 className="w-5 h-5" /></span>
                    Share
                  </button>
                  <button onClick={() => handleQuickShareAction('x')} className="flex flex-col items-center gap-1 text-xs text-gray-200 min-w-16">
                    <span className="w-11 h-11 rounded-full bg-gray-800 flex items-center justify-center text-sm font-semibold">X</span>
                    X
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Story?"
        message="This story will be removed permanently."
        confirmLabel="Delete story"
        tone="danger"
        loading={deletingStory}
        onClose={() => {
          if (!deletingStory) setShowDeleteConfirm(false)
        }}
        onConfirm={handleDelete}
      />
    </div>
  )
}
