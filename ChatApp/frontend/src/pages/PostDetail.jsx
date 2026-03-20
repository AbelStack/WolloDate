import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Heart, Loader2, MessageCircle, Send, Share2, X, Link as LinkIcon, Pencil } from 'lucide-react'
import VerifiedBadge from '../components/VerifiedBadge'
import { comments, conversations, messages, posts } from '../api'
import { useSocket } from '../context/useSocket'
import { SHARED_POST_MESSAGE } from '../utils/chatShares'
import { resolveMediaUrl } from '../utils/media'
import { useAuth } from '../context/AuthContext'

const getAvatarUrl = (u) => {
  if (u?.avatar_url) return u.avatar_url
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(u?.name || 'U')}&background=374151&color=fff`
}

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

            {/* Media rendering block: allow both images and videos */}
            {(() => {
              const mediaUrls = getPostMediaUrls(post);
              if (!mediaUrls || mediaUrls.length === 0) return null;
              // Guess type by file extension
              const getType = (url) => {
                const ext = (url.split('.').pop() || '').toLowerCase();
                const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'heif', 'avif', 'jfif'];
                const videoExts = ['mp4', 'mov', 'webm', 'mkv', '3gp', 'avi', 'wmv', 'mpeg'];
                if (imageExts.includes(ext)) return 'image';
                if (videoExts.includes(ext)) return 'video';
                return 'image';
              };
              return (
                <div className="relative">
                  <div
                    ref={mediaContainerRef}
                    className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide"
                    onScroll={handleMediaScroll}
                  >
                    {mediaUrls.map((url, idx) => {
                      const type = getType(url);
                      return type === 'video' ? (
                        <video
                          key={`${post.id}-video-${idx}`}
                          src={url}
                          className="w-full shrink-0 max-h-[65vh] object-contain bg-black snap-start"
                          controls
                          playsInline
                        />
                      ) : (
                        <img
                          key={`${post.id}-img-${idx}`}
                          src={url}
                          alt="Post"
                          className="w-full shrink-0 max-h-[65vh] object-contain bg-black snap-start"
                        />
                      );
                    })}
                  </div>
                  {mediaUrls.length > 1 && (
                    <>
                      <div className="absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
                        {mediaIndex + 1}/{mediaUrls.length}
                      </div>
                      <button
                        type="button"
                        onClick={() => navigateMedia(-1, mediaUrls.length)}
                        className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/55 rounded-full text-white hover:bg-black/75"
                        aria-label="Previous media"
                      >
                        {'<'}
                      </button>
                      <button
                        type="button"
                        onClick={() => navigateMedia(1, mediaUrls.length)}
                        className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/55 rounded-full text-white hover:bg-black/75"
                        aria-label="Next media"
                      >
                        {'>'}
                      </button>
                    </>
                  )}
                </div>
              );
            })()}

            {(post.caption || post.user?.id === user?.id) && (
              <div className="px-4 pt-3 text-sm text-gray-200 whitespace-pre-wrap">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-semibold mr-1 text-white">{post.user?.name}</span>
                    {!editingCaption && <span>{post.caption}</span>}
                  </div>
                  {post.user?.id === user?.id && !editingCaption && (
                    <button
                      type="button"
                      onClick={() => setEditingCaption(true)}
                      className="p-1 rounded-full hover:bg-gray-800 text-gray-300"
                      aria-label="Edit caption"
                    >
                      <Pencil size={16} />
                    </button>
                  )}
                </div>

                {editingCaption && (
                  <div className="mt-2 rounded-xl border border-gray-700 bg-gray-800 p-3">
                    <textarea
                      rows={3}
                      value={captionInput}
                      onChange={(e) => setCaptionInput(e.target.value)}
                      className="w-full resize-none bg-transparent border-0 focus:ring-0 text-white placeholder-gray-500 text-sm"
                      placeholder="Edit your caption"
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <button type="button" onClick={() => { setEditingCaption(false); setCaptionInput(post.caption || '') }} className="px-3 py-1.5 rounded-lg bg-gray-700 text-white text-sm">Cancel</button>
                      <button type="button" onClick={saveCaption} disabled={savingCaption} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-50">{savingCaption ? 'Saving...' : 'Save'}</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="p-4">
              <div className="flex items-center gap-4 mb-3">
                <button
                  onClick={handleLike}
                  className={`${post.is_liked ? 'text-red-500' : 'text-gray-300 hover:text-white'}`}
                  type="button"
                >
                  <Heart size={24} className={post.is_liked ? 'fill-current' : ''} />
                </button>
                <button
                  type="button"
                  onClick={() => document.getElementById('post-comment-input')?.focus()}
                  className="text-gray-300 hover:text-white"
                >
                  <MessageCircle size={24} />
                </button>
                <button type="button" onClick={handleOpenShare} className="text-gray-300 hover:text-white">
                  <Share2 size={24} />
                </button>
              </div>

              {post.likes_count > 0 && (
                <p className="font-semibold text-sm text-white mb-3">
                  {post.likes_count} {post.likes_count === 1 ? 'like' : 'likes'}
                </p>
              )}

              <div className="space-y-3 mb-4">
                {(post.comments || []).map((comment) => (
                  <div key={comment.id} className="flex gap-2">
                    <img
                      src={getAvatarUrl(comment.user)}
                      alt={comment.user?.name}
                      className="w-7 h-7 rounded-full object-cover mt-0.5"
                    />
                    <div className="min-w-0">
                      <p className="text-sm text-gray-200 whitespace-pre-wrap">
                        <span className="font-semibold text-white mr-1">{comment.user?.name}</span>
                        {comment.content}
                      </p>
                    </div>
                  </div>
                ))}

                {Number(post.comments_count || 0) > (post.comments || []).length && (
                  <p className="text-xs text-gray-500">
                    Showing {(post.comments || []).length} of {post.comments_count} comments.
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 border-t border-gray-800 pt-3">
                <input
                  id="post-comment-input"
                  type="text"
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  placeholder="Add a comment..."
                  className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
                <button
                  type="button"
                  onClick={handleAddComment}
                  disabled={!commentInput.trim() || submittingComment}
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
                >
                  {submittingComment ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {shareModalOpen && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end md:items-center justify-center p-0 md:p-6" onClick={() => setShareModalOpen(false)}>
          <div className="w-full h-[88vh] md:h-auto md:max-w-175 rounded-t-2xl md:rounded-3xl bg-[#1f232e] border border-gray-800 overflow-hidden md:max-h-[78vh] flex flex-col min-h-0" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <button type="button" onClick={() => setShareModalOpen(false)} className="p-1.5 rounded-full hover:bg-gray-800" aria-label="Close share modal">
                <X size={18} className="text-white" />
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
                        onClick={() => sendSharedPostToChat(conv.id)}
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
              <div className="px-4 pt-2">
                <div className="w-10 h-1 rounded-full bg-gray-600 mx-auto mb-3" />
              </div>

              <div className="overflow-y-auto flex-1 min-h-0 px-4 pb-4">
                {loadingChats ? (
                  <div className="py-10 flex justify-center">
                    <Loader2 className="animate-spin text-gray-400" />
                  </div>
                ) : filteredChats.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-500">No chats found</p>
                ) : (
                  <div className="grid grid-cols-3 gap-x-4 gap-y-6">
                    {filteredChats.slice(0, 12).map(conv => (
                      <button key={conv.id} type="button" onClick={() => sendSharedPostToChat(conv.id)} disabled={Boolean(sendingTo)} className="text-center disabled:opacity-60">
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
    </div>
  )
}
