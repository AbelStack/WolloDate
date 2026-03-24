import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Heart, Loader2, MessageCircle, Send, Share2, X, Link as LinkIcon, Pencil, Trash2, MoreVertical } from 'lucide-react'
import VerifiedBadge from '../components/VerifiedBadge'
import { PostSkeleton, CommentSkeleton } from '../components/Skeleton'
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
  const [editingCommentId, setEditingCommentId] = useState(null)
  const [editingCommentContent, setEditingCommentContent] = useState('')
  const [savingComment, setSavingComment] = useState(false)
  const [commentMenuOpen, setCommentMenuOpen] = useState(null)

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
    } catch {
      // Silent failure
    } finally {
      setSubmittingComment(false)
    }
  }

  const handleEditComment = (comment) => {
    setEditingCommentId(comment.id)
    setEditingCommentContent(comment.content)
    setCommentMenuOpen(null)
  }

  const handleCancelEditComment = () => {
    setEditingCommentId(null)
    setEditingCommentContent('')
  }

  const handleSaveComment = async (comment) => {
    if (!editingCommentContent.trim()) return
    setSavingComment(true)
    try {
      await comments.update(comment.id, { content: editingCommentContent.trim() })
      setPost((prev) => ({
        ...prev,
        comments: prev.comments.map((c) =>
          c.id === comment.id ? { ...c, content: editingCommentContent.trim() } : c
        ),
      }))
      setEditingCommentId(null)
      setEditingCommentContent('')
    } catch (err) {
      alert(err?.response?.data?.message || 'Failed to update comment')
    } finally {
      setSavingComment(false)
    }
  }

  const handleDeleteComment = async (comment) => {
    setCommentMenuOpen(null)
    
    const isPostOwner = post?.user?.id === user?.id
    const isCommentOwner = comment.user?.id === user?.id
    
    let confirmMessage = 'Delete this comment?'
    if (isPostOwner && !isCommentOwner) {
      confirmMessage = 'Delete this comment from your post? This will also remove all replies.'
    }
    
    if (!window.confirm(confirmMessage)) return
    
    try {
      await comments.delete(comment.id)
      setPost((prev) => ({
        ...prev,
        comments: prev.comments.filter((c) => c.id !== comment.id),
        comments_count: Math.max(0, (prev.comments_count || 1) - 1),
      }))
    } catch (err) {
      alert(err?.response?.data?.message || 'Failed to delete comment')
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
    } catch {
      // Silent failure
    } finally {
      setSendingTo(null)
    }
  }

  const getShareUrl = (targetPostId) => `${window.location.origin}/post/${targetPostId}`

  const handleQuickShareAction = async (action) => {
    if (!post) return

    const shareUrl = getShareUrl(post.id)
    const shareText = `Check out this post on WolloGram: ${shareUrl}`

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
        window.location.href = `mailto:?subject=${encodeURIComponent('Post from WolloGram')}&body=${encodeURIComponent(shareText)}`
        return
      }

      if (action === 'x') {
        window.open(`https://x.com/intent/post?text=${encodeURIComponent(shareText)}`, '_blank', 'noopener,noreferrer')
        return
      }

      if (navigator.share) {
        await navigator.share({ title: 'WolloGram Post', text: shareText, url: shareUrl })
        return
      }

      await navigator.clipboard.writeText(shareUrl)
    } catch {
      // Ignore cancelled actions
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

  const handleMediaScroll = (e) => {
    const { scrollLeft, clientWidth } = e.currentTarget
    if (!clientWidth) return
    setMediaIndex(Math.round(scrollLeft / clientWidth))
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
      // Keep current input
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

            {/* Media Section */}
            {getPostMediaUrls(post).length > 0 && (
              <div className="relative bg-black">
                <div
                  ref={mediaContainerRef}
                  onScroll={handleMediaScroll}
                  className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide"
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                  {getPostMediaUrls(post).map((url, idx) => {
                    const isVideo = /\.(mp4|webm|ogg)$/i.test(url)
                    return (
                      <div key={idx} className="w-full shrink-0 snap-start">
                        {isVideo ? (
                          <video
                            src={url}
                            controls
                            className="w-full max-h-125 object-contain"
                          />
                        ) : (
                          <img
                            src={url}
                            alt={`Post media ${idx + 1}`}
                            className="w-full max-h-125 object-contain"
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
                {getPostMediaUrls(post).length > 1 && (
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                    {getPostMediaUrls(post).map((_, idx) => (
                      <div
                        key={idx}
                        className={`w-1.5 h-1.5 rounded-full ${
                          idx === mediaIndex ? 'bg-white' : 'bg-gray-500'
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Caption Section */}
            <div className="px-4 py-3">
              {editingCaption ? (
                <div className="flex flex-col gap-2">
                  <textarea
                    value={captionInput}
                    onChange={(e) => setCaptionInput(e.target.value)}
                    className="w-full px-3 py-2 rounded bg-gray-800 text-white resize-none"
                    rows={3}
                    disabled={savingCaption}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={saveCaption}
                      disabled={savingCaption}
                      className="px-4 py-1 text-white rounded transition"
                      style={{ backgroundColor: '#5DADE2' }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#4A9FD5'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#5DADE2'}
                    >
                      {savingCaption ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={() => {
                        setEditingCaption(false)
                        setCaptionInput(post.caption || '')
                      }}
                      className="px-4 py-1 bg-gray-700 text-white rounded hover:bg-gray-600"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <p className="text-sm text-gray-200 flex-1">{post.caption || 'No caption'}</p>
                  {post.user?.id === user?.id && (
                    <button
                      onClick={() => setEditingCaption(true)}
                      className="text-gray-400 hover:text-white"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-4 px-4 py-2 border-t border-gray-800">
              <button
                onClick={handleLike}
                className="flex items-center gap-1 hover:opacity-60"
              >
                <Heart
                  size={24}
                  className={post.is_liked ? 'fill-red-500 text-red-500' : 'text-white'}
                />
                <span className="text-sm">{post.likes_count || 0}</span>
              </button>
              <button className="flex items-center gap-1 hover:opacity-60">
                <MessageCircle size={24} />
                <span className="text-sm">{post.comments_count || 0}</span>
              </button>
              <button onClick={handleOpenShare} className="hover:opacity-60">
                <Share2 size={24} />
              </button>
            </div>

            {/* Comments Section */}
            <div className="border-t border-gray-800 px-4 py-3">
              <h3 className="text-sm text-gray-400 mb-2">{post.comments.length} Comments</h3>
              {post.comments.map((comment) => (
                <div key={comment.id} className="flex gap-2 mb-3">
                  <img
                    src={getAvatarUrl(comment.user)}
                    alt={comment.user?.name}
                    className="w-8 h-8 rounded-full object-cover"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-white">{comment.user?.name}</span>
                      {comment.user?.is_approved && <VerifiedBadge size="xs" />}
                      <span className="text-xs text-gray-500">{formatTime(comment.created_at)}</span>
                      
                      {/* 3-dot menu for comment owner or post owner */}
                      {(comment.user?.id === user?.id || post.user?.id === user?.id) && (
                        <div className="ml-auto relative">
                          <button
                            onClick={() => setCommentMenuOpen(commentMenuOpen === comment.id ? null : comment.id)}
                            className="text-gray-400 hover:text-white p-1"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                          
                          {commentMenuOpen === comment.id && (
                            <>
                              <div 
                                className="fixed inset-0 z-10" 
                                onClick={() => setCommentMenuOpen(null)}
                              />
                              
                              <div className="absolute right-0 top-6 bg-gray-800 rounded-lg shadow-lg border border-gray-700 py-1 z-20 min-w-[120px]">
                                {comment.user?.id === user?.id && (
                                  <button
                                    onClick={() => handleEditComment(comment)}
                                    className="w-full text-left px-4 py-2 text-sm text-white hover:bg-gray-700 flex items-center gap-2"
                                  >
                                    <Pencil className="w-4 h-4" />
                                    Edit
                                  </button>
                                )}
                                <button
                                  onClick={() => handleDeleteComment(comment)}
                                  className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-700 flex items-center gap-2"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  Delete
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    {editingCommentId === comment.id ? (
                      <div className="mt-1 flex gap-2">
                        <input
                          type="text"
                          value={editingCommentContent}
                          onChange={(e) => setEditingCommentContent(e.target.value)}
                          className="flex-1 px-2 py-1 rounded bg-gray-800 text-white"
                          disabled={savingComment}
                        />
                        <button
                          onClick={() => handleSaveComment(comment)}
                          disabled={savingComment}
                          className="px-2 py-1 text-white rounded"
                          style={{ backgroundColor: '#5DADE2' }}
                        >
                          Save
                        </button>
                        <button
                          onClick={handleCancelEditComment}
                          className="px-2 py-1 bg-gray-700 text-white rounded"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-200 mt-1">{comment.content}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Add Comment Input */}
            <div className="border-t border-gray-800 px-4 py-3 flex items-center gap-2">
              <textarea
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleAddComment()
                  }
                }}
                placeholder="Write a comment..."
                rows={1}
                className="flex-1 px-3 py-2 rounded-full bg-gray-800 text-white placeholder-gray-500 focus:outline-none focus:ring-2 resize-none max-h-32 overflow-y-auto"
                style={{ '--tw-ring-color': '#5DADE2', height: 'auto', minHeight: '40px' }}
                ref={(el) => {
                  if (el) {
                    el.style.height = 'auto'
                    el.style.height = el.scrollHeight + 'px'
                  }
                }}
                disabled={submittingComment}
              />
              <button
                onClick={handleAddComment}
                disabled={submittingComment || !commentInput.trim()}
                className="p-2 rounded-full text-white disabled:opacity-50 disabled:cursor-not-allowed transition"
                style={{ backgroundColor: '#5DADE2' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#4A9FD5'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#5DADE2'}
              >
                {submittingComment ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send size={20} />
                )}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Share Modal */}
      {shareModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <h2 className="text-lg font-semibold">Share Post</h2>
              <button onClick={() => setShareModalOpen(false)} className="hover:opacity-60">
                <X size={24} />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <button
                onClick={() => handleQuickShareAction('copy')}
                className="w-full flex items-center gap-3 p-3 rounded-lg bg-gray-800 hover:bg-gray-700"
              >
                <LinkIcon size={20} />
                <span>Copy Link</span>
              </button>
              <button
                onClick={() => handleQuickShareAction('whatsapp')}
                className="w-full flex items-center gap-3 p-3 rounded-lg bg-gray-800 hover:bg-gray-700"
              >
                <Share2 size={20} />
                <span>Share to WhatsApp</span>
              </button>
            </div>

            <div className="border-t border-gray-800 p-4">
              <h3 className="text-sm font-semibold mb-2">Send to Chat</h3>
              <input
                type="text"
                value={shareSearch}
                onChange={(e) => setShareSearch(e.target.value)}
                placeholder="Search chats..."
                className="w-full px-3 py-2 rounded-lg bg-gray-800 text-white placeholder-gray-500 mb-3"
              />
              <div className="max-h-60 overflow-y-auto space-y-2">
                {loadingChats ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                  </div>
                ) : filteredChats.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">No chats found</p>
                ) : (
                  filteredChats.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => handleSendToChat(conv.id)}
                      disabled={sendingTo === conv.id}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-800 disabled:opacity-50"
                    >
                      <img
                        src={getConversationAvatar(conv)}
                        alt={getConversationName(conv)}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                      <span className="flex-1 text-left truncate">{getConversationName(conv)}</span>
                      {sendingTo === conv.id && (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
