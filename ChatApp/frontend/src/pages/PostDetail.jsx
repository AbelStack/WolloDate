import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Heart, Loader2, MessageCircle, Send, Share2, X, Link as LinkIcon, Pencil, Trash2 } from 'lucide-react'
// ...existing code...
import VerifiedBadge from '../components/VerifiedBadge'
import { comments, conversations, messages, posts } from '../api'
import { useSocket } from '../context/useSocket'
import { SHARED_POST_MESSAGE } from '../utils/chatShares'
import { resolveMediaUrl } from '../utils/media'
import { getAvatarUrl } from '../utils/avatar'
import { useAuth } from '../context/AuthContext'

const formatTime = (dateStr) => {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = (now - date) / 1000

  if (diff < 60) return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return date.toLocaleDateString()
}

export default function PostDetail() {
  const navigate = useNavigate()
  const { postId } = useParams()
  const { user } = useAuth()
  const { emitFollowNotify, emitNewMessage } = useSocket()

  const [post, setPost] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [commentInput, setCommentInput] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [chatList, setChatList] = useState([])
  const [loadingChats, setLoadingChats] = useState(false)
  const [sendingTo, setSendingTo] = useState(null)
  const [shareSearch, setShareSearch] = useState('')
  const [mediaIndex, setMediaIndex] = useState(0)
  const [editingCaption, setEditingCaption] = useState(false)
  const [captionInput, setCaptionInput] = useState('')
  const [savingCaption, setSavingCaption] = useState(false)

  const mediaContainerRef = useRef(null)

  useEffect(() => {
    const loadPost = async () => {
      try {
        setLoading(true)
        setError('')
        const res = await posts.get(postId)
        const payload = res.data
        payload.comments = payload.comments || []
        setPost(payload)
        setCaptionInput(payload.caption || '')
        setEditingCaption(false)
        setMediaIndex(0)
      } catch (err) {
        setError(err.response?.data?.message || 'Post not available')
      } finally {
        setLoading(false)
      }
    }

    loadPost()
  }, [postId])

  const handleLike = async () => {
    if (!post) return

    const wasLiked = Boolean(post.is_liked)
    setPost(prev => ({
      ...prev,
      is_liked: !wasLiked,
      likes_count: Number(prev.likes_count || 0) + (wasLiked ? -1 : 1),
    }))

    try {
      if (wasLiked) {
        await posts.unlike(post.id)
      } else {
        await posts.like(post.id)
      }
    } catch {
      setPost(prev => ({
        ...prev,
        is_liked: wasLiked,
        likes_count: Number(prev.likes_count || 0) + (wasLiked ? 1 : -1),
      }))
    }
  }

  const handleAddComment = async () => {
    const content = commentInput.trim()
    if (!content || !post || submittingComment) return

    try {
      setSubmittingComment(true)
      const res = await comments.create(post.id, { content })
      setPost(prev => ({
        ...prev,
        comments: [...(prev.comments || []), res.data],
        comments_count: Number(prev.comments_count || 0) + 1,
      }))
      setCommentInput('')
      // No comment-notification: do not emit notifications for comments
    } catch {
      // Keep UI simple: silent failure is avoided by retaining current input.
    } finally {
      setSubmittingComment(false)
    }
  }

  const handleOpenShare = async () => {
    if (!post) return
    setShareModalOpen(true)
    setShareSearch('')

    try {
      setLoadingChats(true)
      const res = await conversations.list()
      setChatList(res.data.data || res.data || [])
    } catch {
      setChatList([])
    } finally {
      setLoadingChats(false)
    }
  }

  const toMemberUser = (member) => member?.user || member

  const getConversationName = (conv) => {
    if (conv?.name) return conv.name
    const other = (conv.members || [])
      .map(toMemberUser)
      .find((m) => m?.id !== user?.id)
    return other?.name || 'Chat'
  }

  const getConversationAvatar = (conv) => {
    if (conv?.avatar_url) return conv.avatar_url
    const other = (conv.members || [])
      .map(toMemberUser)
      .find((m) => m?.id !== user?.id)
    return getAvatarUrl(other)
  }

  const handleSendToChat = async (convId) => {
    if (!post || sendingTo) return

    try {
      setSendingTo(convId)
      const res = await messages.send(convId, {
        content: SHARED_POST_MESSAGE,
        post_id: post.id,
      })
      emitNewMessage(convId, res.data?.data, res.data?.member_ids || [])
      setShareModalOpen(false)
      return
    } catch {
      // Fail silently to avoid breaking navigation flow.
      return
    } finally {
      setSendingTo(null)
    }

    try {
      setSendingTo(convId)
      const shareText = `📌 Shared post from ${post.user?.name || 'someone'}:\n${post.caption || ''}\n${window.location.origin}/post/${post.id}`
      await messages.send(convId, { content: shareText })
      setShareModalOpen(false)
    } catch {
      // Fail silently to avoid breaking navigation flow.
    } finally {
      setSendingTo(null)
    }
  }

  const sendSharedPostToChat = async (convId) => {
    if (!post || sendingTo) return

    try {
      setSendingTo(convId)
      const res = await messages.send(convId, {
        content: SHARED_POST_MESSAGE,
        post_id: post.id,
      })
      emitNewMessage(convId, res.data?.data, res.data?.member_ids || [])
      setShareModalOpen(false)
    } catch {
      // Fail silently to avoid breaking navigation flow.
    } finally {
      setSendingTo(null)
    }
  }

  const getShareUrl = (targetPostId) => `${window.location.origin}/post/${targetPostId}`

  const handleQuickShareAction = async (action) => {
    if (!post) return

    const shareUrl = getShareUrl(post.id)
    const shareText = `Check out this post on WolloDate: ${shareUrl}`

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
        window.location.href = `mailto:?subject=${encodeURIComponent('Post from WolloDate')}&body=${encodeURIComponent(shareText)}`
        return
      }

      if (action === 'x') {
        window.open(`https://x.com/intent/post?text=${encodeURIComponent(shareText)}`, '_blank', 'noopener,noreferrer')
        return
      }

      if (navigator.share) {
        await navigator.share({ title: 'WolloDate Post', text: shareText, url: shareUrl })
        return
      }

      await navigator.clipboard.writeText(shareUrl)
    } catch {
      // Ignore user-cancelled share actions.
    }
  }

  const filteredChats = chatList.filter(conv => {
    if (!shareSearch.trim()) return true
    return getConversationName(conv).toLowerCase().includes(shareSearch.trim().toLowerCase())
  })

  const getPostMediaUrls = (targetPost) => {
    const list = Array.isArray(targetPost?.media_urls) && targetPost.media_urls.length > 0
      ? targetPost.media_urls
      : (targetPost?.image_url ? [targetPost.image_url] : [])

    return list.map((path) => resolveMediaUrl(path))
  }

  // posts: allow both images and videos

  const handleMediaScroll = (e) => {
    const { scrollLeft, clientWidth } = e.currentTarget
    if (!clientWidth) return
    setMediaIndex(Math.round(scrollLeft / clientWidth))
  }

  const navigateMedia = (direction, total) => {
    if (!mediaContainerRef.current || total <= 1) return
    const next = Math.max(0, Math.min(total - 1, mediaIndex + direction))
    mediaContainerRef.current.scrollTo({
      left: mediaContainerRef.current.clientWidth * next,
      behavior: 'smooth',
    })
    setMediaIndex(next)
  }

  const saveCaption = async () => {
    if (!post || savingCaption) return

    try {
      setSavingCaption(true)
      const res = await posts.update(post.id, { caption: captionInput.trim() || null })
      const fallbackCaption = captionInput.trim() || null
      const nextCaption = res.data?.post?.caption ?? fallbackCaption
      setPost((prev) => ({ ...prev, caption: nextCaption }))
      setEditingCaption(false)
    } catch {
      // Keep current input so user can retry.
    } finally {
      setSavingCaption(false)
    }
  }

  return (
    <div className="min-h-screen bg-black text-white pb-6">
      <div className="sticky top-0 bg-black border-b border-gray-800 px-4 h-14 flex items-center gap-3 z-20">
        <button onClick={() => navigate(-1)} className="hover:opacity-60 text-white">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-lg font-semibold">Post</h1>
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
        ) : post ? (
          <div className="rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden">
            <div className="flex items-center gap-3 p-4">
              <img
                src={getAvatarUrl(post.user)}
                alt={post.user?.name}
                className="w-10 h-10 rounded-full object-cover"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => navigate(`/profile/${post.user?.id}`)}
                    className="text-sm font-semibold truncate hover:underline"
                  >
                    {post.user?.name}
                  </button>
                  {post.user?.is_approved && <VerifiedBadge size="xs" />}
                </div>
                <p className="text-xs text-gray-500">{formatTime(post.created_at)}</p>
              </div>
            </div>
            {/* ...rest of the component... */}
          </div>
        ) : null}
      </div>
    </div>
  )
}
