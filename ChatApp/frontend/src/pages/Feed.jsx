import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../context/useSocket'
import { posts, comments, conversations, messages, friends, follows, users } from '../api'
import VerifiedBadge from '../components/VerifiedBadge'
import CreatorBadge from '../components/CreatorBadge'
import Logo from '../components/Logo'
import StoriesBar from '../components/StoriesBar'
import ConfirmDialog from '../components/ConfirmDialog'
import { resolveMediaUrl } from '../utils/media'
import { getAvatarUrl } from '../utils/avatar'
import { SHARED_POST_MESSAGE } from '../utils/chatShares'
import { isCreatorUser } from '../utils/creator'
import { 
  Heart, MessageCircle, Share2, MoreHorizontal, 
  Image as ImageIcon, X, Send, Loader2, Bookmark,
  BookmarkCheck, Trash2, Link as LinkIcon, Flag, UserPlus, Users, Pencil, Check, Sparkles, Compass
} from 'lucide-react'

const getPostMediaUrls = (post) => {
  const list = Array.isArray(post?.media_urls) && post.media_urls.length > 0
    ? post.media_urls
    : (post?.image_url ? [post.image_url] : [])

  return list.map((path) => resolveMediaUrl(path))
}


// Helper to check if a media URL is a video
const isVideoUrl = (url) => {
  if (!url) return false;
  const videoExts = ['mp4', 'mov', 'webm', 'mkv', '3gp', 'avi', 'wmv', 'mpeg'];
  const ext = url.split('.').pop().split('?')[0].toLowerCase();
  return videoExts.includes(ext);
}

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

export default function Feed() {
  const { user } = useAuth()
  const { emitFollowNotify, emitNewMessage } = useSocket()
  const navigate = useNavigate()
  
  const [feed, setFeed] = useState([])
  const [loading, setLoading] = useState(true)
  const [posting, setPosting] = useState(false)
  const [newPostContent, setNewPostContent] = useState('')
  const [newPostMedia, setNewPostMedia] = useState([])
  const [mediaPreviews, setMediaPreviews] = useState([])
  const [createPreviewIndex, setCreatePreviewIndex] = useState(0)
  const [postMediaIndexes, setPostMediaIndexes] = useState({})
  const [expandedComments, setExpandedComments] = useState({})
  const [commentInputs, setCommentInputs] = useState({})
  const [postComments, setPostComments] = useState({})
  const [loadingComments, setLoadingComments] = useState({})
  const [commentActionLoading, setCommentActionLoading] = useState({})
  const [editingComments, setEditingComments] = useState({})
  const [editingCommentText, setEditingCommentText] = useState({})
  const [replyInputs, setReplyInputs] = useState({})
  const [activeReplyBoxes, setActiveReplyBoxes] = useState({})
  const [expandedReplyThreads, setExpandedReplyThreads] = useState({})
  const [loadingReplies, setLoadingReplies] = useState({})
  const [savedPosts, setSavedPosts] = useState({})
  const [menuOpen, setMenuOpen] = useState(null)
  const [shareModalPost, setShareModalPost] = useState(null)
  const [chatList, setChatList] = useState([])
  const [loadingChats, setLoadingChats] = useState(false)
  const [sendingTo, setSendingTo] = useState(null)
  const [shareSearch, setShareSearch] = useState('')
  const [showAllShareChats, setShowAllShareChats] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [followedIds, setFollowedIds] = useState(new Set())
  const [editingPostId, setEditingPostId] = useState(null)
  const [editingPostCaption, setEditingPostCaption] = useState('')
  const [savingPostCaption, setSavingPostCaption] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState(null)
  const [confirmLoading, setConfirmLoading] = useState(false)
  
  const fileInputRef = useRef(null)
  const mentionUserCacheRef = useRef(new Map())
  const postMediaRefs = useRef({})
  const confirmActionRef = useRef(null)

  useEffect(() => {
    loadFeed()
    loadSuggestions()
  }, [])

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

  const loadFeed = async () => {
    try {
      setLoading(true)
      const res = await posts.getFeed()
      setFeed(res.data.data || res.data || [])
    } catch (err) {
      console.error('Failed to load feed:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadSuggestions = async () => {
    try {
      const res = await friends.suggestions(8)
      const raw = Array.isArray(res.data) ? res.data : []
      const seen = new Set()
      const cleaned = raw.filter((s) => {
        if (!s || typeof s.id === 'undefined' || s.id === null) return false
        if (s.id === user?.id) return false
        if (seen.has(s.id)) return false
        seen.add(s.id)
        return true
      })
      setSuggestions(cleaned)
    } catch (err) {
      console.error('Failed to load suggestions:', err)
    }
  }

  const handleFollow = async (userId) => {
    try {
      await follows.follow(userId)
      setFollowedIds(prev => {
        const next = new Set(prev)
        next.add(userId)
        return next
      })
      setSuggestions(prev => prev.filter(s => s.id !== userId))
    } catch (err) {
      console.error('Failed to follow:', err)
    }
  }

  const handleDismissSuggestion = (userId) => {
    setSuggestions(prev => prev.filter(s => s.id !== userId))
  }

  const revokePreviewUrl = (url) => {
    if (url && typeof url === 'string' && url.startsWith('blob:')) {
      URL.revokeObjectURL(url)
    }
  }

  const revokePreviewUrls = (urls) => {
    ;(urls || []).forEach(revokePreviewUrl)
  }

  const handleMediaSelect = (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      if (files.length > 8) {
        alert('You can upload up to 8 media files per post')
        return
      }

      const validated = []
      for (const file of files) {
        const ext = (file.name.split('.').pop() || '').toLowerCase()
        const mime = (file.type || '').toLowerCase()
        const imageExts = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'heif', 'avif', 'jfif'])
        const videoExts = new Set(['mp4', 'mov', 'webm', 'mkv', '3gp', 'avi', 'wmv', 'mpeg'])
        const isImage = mime.startsWith('image/') || imageExts.has(ext)
        const isVideo = mime.startsWith('video/') || videoExts.has(ext)

        if (!isImage && !isVideo) {
          alert('Please select an image or video file')
          return
        }
        if ((isImage && file.size > 50 * 1024 * 1024) || (isVideo && file.size > 50 * 1024 * 1024)) {
          alert('Each file must be less than 50MB')
          return
        }
        validated.push(file)
      }

      revokePreviewUrls(mediaPreviews)
      setNewPostMedia(validated)
      setMediaPreviews(validated.map((file) => URL.createObjectURL(file)))
      setCreatePreviewIndex(0)
    }
  }

  const removeMedia = () => {
    revokePreviewUrls(mediaPreviews)
    setNewPostMedia([])
    setMediaPreviews([])
    setCreatePreviewIndex(0)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleCreatePost = async () => {
    if (!newPostContent.trim() && newPostMedia.length === 0) return
    try {
      setPosting(true)
      const formData = new FormData()
      if (newPostContent.trim()) formData.append('caption', newPostContent.trim())
      if (newPostMedia.length > 1) {
        newPostMedia.forEach((file) => formData.append('media_files[]', file))
      } else if (newPostMedia.length === 1) {
        formData.append('media', newPostMedia[0])
      }
      const res = await posts.create(formData)
      const mentionedUserIds = res?.data?.mentioned_user_ids || []
      mentionedUserIds.forEach((targetUserId) => emitFollowNotify(targetUserId))
      const newPost = { ...res.data, likes_count: 0, comments_count: 0, is_liked: false }
      setFeed([newPost, ...feed])
      setNewPostContent('')
      removeMedia()
    } catch (err) {
      console.error('Failed to create post:', err)
      alert('Failed to create post')
    } finally {
      setPosting(false)
    }
  }

  const goToCreatePreview = (direction) => {
    if (imagePreviews.length <= 1) return
    setCreatePreviewIndex((prev) => {
      const next = prev + direction
      if (next < 0) return imagePreviews.length - 1
      if (next >= imagePreviews.length) return 0
      return next
    })
  }

  const handlePostMediaScroll = (postId, e) => {
    const { scrollLeft, clientWidth } = e.currentTarget
    if (!clientWidth) return
    const idx = Math.round(scrollLeft / clientWidth)
    setPostMediaIndexes((prev) => ({ ...prev, [postId]: idx }))
  }

  const handleLike = async (postId) => {
    const post = feed.find(p => p.id === postId)
    if (!post) return
    
    try {
      if (post.is_liked) {
        await posts.unlike(postId)
        setFeed(feed.map(p => 
          p.id === postId 
            ? { ...p, is_liked: false, likes_count: p.likes_count - 1 }
            : p
        ))
      } else {
        await posts.like(postId)
        setFeed(feed.map(p => 
          p.id === postId 
            ? { ...p, is_liked: true, likes_count: p.likes_count + 1 }
            : p
        ))
      }
    } catch (err) {
      console.error('Failed to toggle like:', err)
    }
  }

  const toggleComments = async (postId) => {
    if (expandedComments[postId]) {
      setExpandedComments({ ...expandedComments, [postId]: false })
      return
    }
    
    setExpandedComments({ ...expandedComments, [postId]: true })
    
    if (!postComments[postId]) {
      try {
        setLoadingComments({ ...loadingComments, [postId]: true })
        const res = await comments.list(postId)
        setPostComments({ ...postComments, [postId]: res.data.data || res.data || [] })
      } catch (err) {
        console.error('Failed to load comments:', err)
      } finally {
        setLoadingComments({ ...loadingComments, [postId]: false })
      }
    }
  }

  const handleAddComment = async (postId) => {
    const content = commentInputs[postId]?.trim()
    if (!content) return
    
    try {
      const res = await comments.create(postId, { content })
      setPostComments({
        ...postComments,
        [postId]: [...(postComments[postId] || []), res.data]
      })
      setCommentInputs({ ...commentInputs, [postId]: '' })
      setFeed(feed.map(p => 
        p.id === postId 
          ? { ...p, comments_count: p.comments_count + 1 }
          : p
      ))
      // No comment-notification: do not emit notifications for comments
    } catch (err) {
      console.error('Failed to add comment:', err)
    }
  }

  const getThreadKey = (postId, commentId) => `${postId}-${commentId}`

  const updateCommentInState = (postId, commentId, updater, parentId = null) => {
    setPostComments(prev => ({
      ...prev,
      [postId]: (prev[postId] || []).map((comment) => {
        if (parentId === null && comment.id === commentId) {
          return updater(comment)
        }

        if (parentId !== null && comment.id === parentId) {
          return {
            ...comment,
            replies: (comment.replies || []).map((reply) => (
              reply.id === commentId ? updater(reply) : reply
            )),
          }
        }

        return comment
      }),
    }))
  }

  const toggleReplyBox = (postId, commentId) => {
    const key = getThreadKey(postId, commentId)
    setActiveReplyBoxes(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const handleAddReply = async (postId, parentCommentId) => {
    const key = getThreadKey(postId, parentCommentId)
    const content = (replyInputs[key] || '').trim()
    if (!content) return

    try {
      const res = await comments.create(postId, {
        content,
        parent_id: parentCommentId,
      })

      setPostComments(prev => ({
        ...prev,
        [postId]: (prev[postId] || []).map((comment) => (
          comment.id === parentCommentId
            ? {
                ...comment,
                replies: [...(comment.replies || []), { ...res.data, is_liked: false }],
                replies_count: Number(comment.replies_count || 0) + 1,
              }
            : comment
        )),
      }))

      setFeed(prev => prev.map(p =>
        p.id === postId ? { ...p, comments_count: Number(p.comments_count || 0) + 1 } : p
      ))

      setReplyInputs(prev => ({ ...prev, [key]: '' }))
      setActiveReplyBoxes(prev => ({ ...prev, [key]: false }))
      // No comment-notification: do not emit notifications for replies
    } catch (err) {
      console.error('Failed to add reply:', err)
      alert('Failed to add reply')
    }
  }

  const handleLoadReplies = async (postId, commentId) => {
    const key = getThreadKey(postId, commentId)
    const currentlyOpen = Boolean(expandedReplyThreads[key])
    if (currentlyOpen) {
      setExpandedReplyThreads(prev => ({ ...prev, [key]: false }))
      return
    }

    try {
      setLoadingReplies(prev => ({ ...prev, [key]: true }))
      const res = await comments.getReplies(commentId)
      const replies = res.data?.data || res.data || []
      setPostComments(prev => ({
        ...prev,
        [postId]: (prev[postId] || []).map((comment) => (
          comment.id === commentId ? { ...comment, replies } : comment
        )),
      }))
      setExpandedReplyThreads(prev => ({ ...prev, [key]: true }))
    } catch (err) {
      console.error('Failed to load replies:', err)
    } finally {
      setLoadingReplies(prev => ({ ...prev, [key]: false }))
    }
  }

  const handleToggleCommentLike = async (postId, commentId, parentId = null) => {
    const sourceList = postComments[postId] || []
    const target = parentId === null
      ? sourceList.find(c => c.id === commentId)
      : sourceList.find(c => c.id === parentId)?.replies?.find(r => r.id === commentId)

    if (!target) return

    const wasLiked = Boolean(target.is_liked)
    updateCommentInState(
      postId,
      commentId,
      (comment) => ({
        ...comment,
        is_liked: !wasLiked,
        likes_count: Number(comment.likes_count || 0) + (wasLiked ? -1 : 1),
      }),
      parentId
    )

    try {
      if (wasLiked) {
        await comments.unlike(commentId)
      } else {
        await comments.like(commentId)
      }
    } catch (err) {
      updateCommentInState(
        postId,
        commentId,
        (comment) => ({
          ...comment,
          is_liked: wasLiked,
          likes_count: Number(comment.likes_count || 0) + (wasLiked ? 1 : -1),
        }),
        parentId
      )
      console.error('Failed to toggle comment like:', err)
    }
  }

  const startEditComment = (postId, comment) => {
    const key = `${postId}-${comment.id}`
    setEditingComments(prev => ({ ...prev, [key]: true }))
    setEditingCommentText(prev => ({ ...prev, [key]: comment.content }))
  }

  const cancelEditComment = (postId, commentId) => {
    const key = `${postId}-${commentId}`
    setEditingComments(prev => ({ ...prev, [key]: false }))
    setEditingCommentText(prev => ({ ...prev, [key]: '' }))
  }

  const saveEditComment = async (postId, commentId) => {
    const key = `${postId}-${commentId}`
    const nextContent = (editingCommentText[key] || '').trim()
    if (!nextContent) return

    try {
      setCommentActionLoading(prev => ({ ...prev, [key]: true }))
      // Always use user endpoint for comment update
      const res = await comments.update(commentId, { content: nextContent })
      setPostComments(prev => ({
        ...prev,
        [postId]: (prev[postId] || []).map(c => (
          c.id === commentId
            ? { ...c, ...res.data }
            : {
                ...c,
                replies: (c.replies || []).map(r => (r.id === commentId ? { ...r, ...res.data } : r)),
              }
        )),
      }))
      setEditingComments(prev => ({ ...prev, [key]: false }))
      setEditingCommentText(prev => ({ ...prev, [key]: '' }))
    } catch (err) {
      alert(err?.response?.data?.message || 'Failed to update comment')
    } finally {
      setCommentActionLoading(prev => ({ ...prev, [key]: false }))
    }
  }

  const handleDeleteComment = async (postId, commentId, parentId = null) => {
    const key = `${postId}-${commentId}`

    confirmActionRef.current = async () => {
      try {
        setCommentActionLoading(prev => ({ ...prev, [key]: true }))
        // Always use user endpoint for comment delete
        await comments.delete(commentId)
        setPostComments(prev => ({
          ...prev,
          [postId]: parentId === null
            ? (prev[postId] || []).filter(c => c.id !== commentId)
            : (prev[postId] || []).map(c => (
                c.id === parentId
                  ? {
                      ...c,
                      replies: (c.replies || []).filter(r => r.id !== commentId),
                      replies_count: Math.max(0, Number(c.replies_count || 0) - 1),
                    }
                  : c
              )),
        }))
        setFeed(prev => prev.map(p => p.id === postId ? { ...p, comments_count: Math.max(0, p.comments_count - 1) } : p))
      } catch (err) {
        alert(err?.response?.data?.message || 'Failed to delete comment')
      } finally {
        setCommentActionLoading(prev => ({ ...prev, [key]: false }))
      }
    }

    setConfirmDialog({
      title: 'Delete Comment?',
      message: 'This comment will be removed permanently.',
      confirmLabel: 'Delete comment',
      tone: 'danger',
    })
  }

  const handleShare = async (post) => {
    setShareModalPost(post)
    setShareSearch('')
    setShowAllShareChats(false)
    try {
      setLoadingChats(true)
      const res = await conversations.list()
      setChatList(res.data.data || res.data || [])
    } catch (err) {
      console.error('Failed to load conversations:', err)
    } finally {
      setLoadingChats(false)
    }
  }

  const handleSendToChat = async (convId) => {
    if (!shareModalPost || sendingTo) return

    try {
      setSendingTo(convId)
      const res = await messages.send(convId, {
        content: SHARED_POST_MESSAGE,
        post_id: shareModalPost.id,
      })
      emitNewMessage(convId, res.data?.data, res.data?.member_ids || [])
      setShareModalPost(null)
      setSendingTo(null)
      return
    } catch (err) {
      console.error('Failed to send to chat:', err)
      alert('Failed to share post')
      setSendingTo(null)
      return
    }
    try {
      setSendingTo(convId)
      const shareText = `📌 Shared post from ${shareModalPost.user?.name || 'someone'}:\n${shareModalPost.caption || ''}\n${window.location.origin}/post/${shareModalPost.id}`
      await messages.send(convId, { content: shareText })
      setShareModalPost(null)
      setSendingTo(null)
    } catch (err) {
      console.error('Failed to send to chat:', err)
      alert('Failed to share post')
      setSendingTo(null)
    }
  }

  const sendSharedPostToChat = async (convId) => {
    if (!shareModalPost || sendingTo) return

    try {
      setSendingTo(convId)
      const res = await messages.send(convId, {
        content: SHARED_POST_MESSAGE,
        post_id: shareModalPost.id,
      })
      emitNewMessage(convId, res.data?.data, res.data?.member_ids || [])
      setShareModalPost(null)
    } catch (err) {
      console.error('Failed to send to chat:', err)
      alert('Failed to share post')
    } finally {
      setSendingTo(null)
    }
  }

  const getShareUrl = (postId) => `${window.location.origin}/post/${postId}`

  const handleQuickShareAction = async (action) => {
    if (!shareModalPost) return

    const shareUrl = getShareUrl(shareModalPost.id)
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
      // Ignore user-cancelled share actions.
    }
  }

  const getConversationName = (conv) => {
    if (conv.name) return conv.name

    const toMemberUser = (member) => member?.user || member
    const members = conv.members || []
    const other = members
      .map(toMemberUser)
      .find((m) => m?.id !== user?.id)

    return other?.name || 'Chat'
  }

  const getConversationAvatar = (conv) => {
    if (conv.avatar_url) return conv.avatar_url

    const toMemberUser = (member) => member?.user || member
    const members = conv.members || []
    const other = members
      .map(toMemberUser)
      .find((m) => m?.id !== user?.id)

    return getAvatarUrl(other)
  }

  const filteredChats = chatList.filter(conv => {
    if (!shareSearch.trim()) return true
    const name = getConversationName(conv).toLowerCase()
    return name.includes(shareSearch.toLowerCase())
  })

  const shareChatList = shareSearch.trim() || showAllShareChats
    ? filteredChats
    : filteredChats.slice(0, 12)

  const handleSave = (postId) => {
    setSavedPosts(prev => ({ ...prev, [postId]: !prev[postId] }))
  }

  const handleCopyLink = (postId) => {
    navigator.clipboard.writeText(`${window.location.origin}/post/${postId}`)
    setMenuOpen(null)
  }

  const handleDeletePost = async (postId) => {
    confirmActionRef.current = async () => {
      try {
        await posts.delete(postId)
        setFeed(prev => prev.filter(p => p.id !== postId))
        setMenuOpen(null)
      } catch (err) {
        console.error('Failed to delete post:', err)
      }
    }

    setConfirmDialog({
      title: 'Delete Post?',
      message: 'This post and its media will be removed permanently.',
      confirmLabel: 'Delete post',
      tone: 'danger',
    })
  }

  const closeConfirmDialog = () => {
    if (confirmLoading) return
    confirmActionRef.current = null
    setConfirmDialog(null)
  }

  const submitConfirmDialog = async () => {
    if (!confirmActionRef.current || confirmLoading) return
    try {
      setConfirmLoading(true)
      await confirmActionRef.current()
      setConfirmDialog(null)
      confirmActionRef.current = null
    } finally {
      setConfirmLoading(false)
    }
  }

  const startEditPostCaption = (post) => {
    setMenuOpen(null)
    setEditingPostId(post.id)
    setEditingPostCaption(post.caption || '')
  }

  const cancelEditPostCaption = () => {
    setEditingPostId(null)
    setEditingPostCaption('')
  }

  const savePostCaption = async () => {
    if (!editingPostId || savingPostCaption) return

    try {
      setSavingPostCaption(true)
      const res = await posts.update(editingPostId, { caption: editingPostCaption.trim() || null })
      const updatedPost = res.data?.post || null
      const fallbackCaption = editingPostCaption.trim() || null

      setFeed((prev) => prev.map((p) => (
        p.id === editingPostId
          ? { ...p, caption: updatedPost?.caption ?? fallbackCaption }
          : p
      )))
      cancelEditPostCaption()
    } catch (err) {
      console.error('Failed to update post caption:', err)
      alert('Failed to update caption')
    } finally {
      setSavingPostCaption(false)
    }
  }

  const navigatePostMedia = (postId, direction, total) => {
    const target = postMediaRefs.current[postId]
    if (!target || total <= 1) return

    const currentIdx = postMediaIndexes[postId] || 0
    const nextIdx = Math.max(0, Math.min(total - 1, currentIdx + direction))
    target.scrollTo({ left: nextIdx * target.clientWidth, behavior: 'smooth' })
    setPostMediaIndexes((prev) => ({ ...prev, [postId]: nextIdx }))
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" style={{ backgroundColor: 'var(--color-bg-base)' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--color-text-primary)' }} />
      </div>
    )
  }

  return (
    <div className="min-h-screen text-white relative overflow-hidden" style={{ backgroundColor: 'var(--color-bg-base)', color: 'var(--color-text-primary)' }}>
      <div className="relative z-10">
      {/* Header */}
      <div className="sticky top-0 border-b backdrop-blur-xl px-2 sm:px-4 h-14 flex items-center justify-center z-40" style={{ backgroundColor: 'var(--color-bg-elevated)', borderColor: 'var(--color-border)' }}>
        <Logo size="sm" />
      </div>

      {/* Stories */}
      <StoriesBar />

      <div className="w-full max-w-6xl mx-auto py-2 px-1 sm:py-4 sm:px-4 grid grid-cols-1 gap-4 sm:gap-6 items-start lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          {/* Create Post */}
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-2 sm:p-4 mb-4 sm:mb-6 shadow-[0_12px_34px_rgba(0,0,0,0.35)]">
          <div className="flex gap-3">
            <img
              src={getAvatarUrl(user)}
              alt={user?.name}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover"
            />
            <div className="flex-1 min-w-0">
              <textarea
                value={newPostContent}
                onChange={(e) => setNewPostContent(e.target.value)}
                placeholder="Share something real with your campus..."
                className="w-full resize-none bg-transparent border-0 focus:ring-0 text-white placeholder-gray-500 text-sm min-h-12"
                rows={3}
              />
              
              {mediaPreviews.length > 0 && (
                <div className="relative mt-2 w-full max-w-full">
                  {(() => {
                    const file = newPostMedia[createPreviewIndex];
                    const url = mediaPreviews[createPreviewIndex];
                    if (!file || !url) return null;
                    const isVideo = (file.type || '').startsWith('video/');
                    return isVideo ? (
                      <video
                        src={url}
                        className="w-full max-h-52 sm:max-h-54 rounded-lg object-contain"
                        controls
                        autoPlay
                        muted
                        loop
                        onError={() => setMediaPreviews([])}
                      />
                    ) : (
                      <img
                        src={url}
                        alt="Preview"
                        className="w-full max-h-52 sm:max-h-54 rounded-lg object-contain"
                        onError={() => setMediaPreviews([])}
                      />
                    );
                  })()}
                  {mediaPreviews.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => goToCreatePreview(-1)}
                        className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/50 rounded-full text-white hover:bg-black/70"
                      >
                        {'<'}
                      </button>
                      <button
                        type="button"
                        onClick={() => goToCreatePreview(1)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/50 rounded-full text-white hover:bg-black/70"
                      >
                        {'>'}
                      </button>
                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-2 py-0.5 text-xs text-white">
                        {createPreviewIndex + 1}/{mediaPreviews.length}
                      </div>
                    </>
                  )}
                  <button
                    onClick={removeMedia}
                    className="absolute top-2 right-2 p-1 bg-black/50 rounded-full text-white hover:bg-black/70"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {mediaPreviews.length === 0 && newPostMedia.length > 0 && (
                <div className="mt-2 rounded-lg border border-gray-700 bg-gray-800 px-2 sm:px-3 py-2 flex flex-wrap items-center justify-between gap-2 sm:gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-gray-300">Attached media</p>
                    <p className="text-sm text-white truncate max-w-30 sm:max-w-none">{newPostMedia.length} selected</p>
                  </div>
                  <button
                    onClick={removeMedia}
                    className="p-1.5 bg-black/40 rounded-full text-white hover:bg-black/60"
                    aria-label="Remove attached media"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-800">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleMediaSelect}
                  accept="image/*,video/*"
                  multiple
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 text-gray-400 hover:text-white transition"
                >
                  <ImageIcon className="w-5 h-5" />
                  <span className="text-sm">Media</span>
                </button>
                
                  <button
                  onClick={handleCreatePost}
                  disabled={posting || (!newPostContent.trim() && newPostMedia.length === 0)}
                  className="px-4 py-2 bg-white text-black text-sm font-semibold rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Post'}
                </button>
              </div>

            </div>
          </div>
        </div>

          {/* People You May Know */}
          {suggestions.length > 0 && (
            <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-400 flex items-center gap-2">
                <Users className="w-4 h-4" /> People you may know
              </h3>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
              {suggestions.map(s => (
                <div key={s.id} className="shrink-0 w-36 bg-gray-900 border border-gray-800 rounded-xl p-3 text-center relative">
                  <button
                    onClick={() => handleDismissSuggestion(s.id)}
                    className="absolute top-1.5 right-1.5 text-gray-600 hover:text-gray-400"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <img
                    src={getAvatarUrl(s)}
                    alt={s.name}
                    onClick={() => navigate(`/profile/${s.id}`)}
                    className="w-14 h-14 rounded-full mx-auto mb-2 object-cover cursor-pointer"
                  />
                  <p className="text-white text-xs font-medium truncate">{s.name}</p>
                  {isCreatorUser(s) && <CreatorBadge size="xs" className="mt-1" />}
                  <p className="text-gray-400 text-[9px] truncate mb-1">{s.department_name}</p>
                  <p className="text-gray-500 text-[10px] truncate mb-2">
                    {s.mutual_friends > 0 
                      ? `${s.mutual_friends} mutual friend${s.mutual_friends > 1 ? 's' : ''}`
                      : s.same_department ? 'Same department' : 'Explore'}
                  </p>
                  <button
                    onClick={() => handleFollow(s.id)}
                    disabled={followedIds.has(s.id)}
                    className="w-full py-1.5 text-xs font-semibold rounded-lg text-white disabled:bg-gray-700 disabled:text-gray-400 transition"
                    style={!followedIds.has(s.id) ? { backgroundColor: '#5DADE2' } : {}}
                    onMouseEnter={(e) => { if (!followedIds.has(s.id)) e.currentTarget.style.backgroundColor = '#4A9FD5' }}
                    onMouseLeave={(e) => { if (!followedIds.has(s.id)) e.currentTarget.style.backgroundColor = '#5DADE2' }}
                  >
                    {followedIds.has(s.id) ? 'Followed' : 'Follow'}
                  </button>
                </div>
              ))}
            </div>
            </div>
          )}

          {/* Feed Posts */}
          {feed.length === 0 ? (
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-8 text-center">
            <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <ImageIcon className="w-8 h-8 text-gray-500" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">No posts yet</h3>
            <p className="text-gray-400 text-sm">
              Follow other students to see their posts here, or create your first post!
            </p>
            </div>
          ) : (
            <div className="space-y-4">
            {feed.map((post) => (
              <div key={post.id} className="bg-gray-900 rounded-2xl border border-gray-800 relative shadow-[0_12px_36px_rgba(0,0,0,0.32)] transition hover:border-gray-700">
                {/* Close menu on outside click */}
                {menuOpen === post.id && (
                  <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(null)} />
                )}
                {/* Post Header */}
                <div className="flex items-center justify-between p-4">
                  <div 
                    className="flex items-center gap-3 cursor-pointer"
                    onClick={() => navigate(`/profile/${post.user?.id}`)}
                  >
                    <img
                      src={getAvatarUrl(post.user)}
                      alt={post.user?.name}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                    <div>
                      <div className="flex items-center gap-0.5">
                        <span className="font-semibold text-white text-sm hover:underline">
                          {post.user?.name}
                        </span>
                        {post.user?.is_approved && <VerifiedBadge size="xs" />}
                        {isCreatorUser(post.user) && <CreatorBadge size="compact" className="ml-1 align-middle" />}
                      </div>
                      <span className="text-xs text-gray-500">{formatTime(post.created_at)}</span>
                    </div>
                  </div>
                  <button className="p-2 hover:bg-gray-800 rounded-full transition relative"
                    onClick={() => setMenuOpen(menuOpen === post.id ? null : post.id)}
                  >
                    <MoreHorizontal className="w-5 h-5 text-gray-400" />
                  </button>
                  {menuOpen === post.id && (
                    <div className="absolute right-4 top-14 bg-gray-800 border border-gray-700 rounded-xl shadow-lg z-30 overflow-hidden min-w-40">
                      <button onClick={() => handleCopyLink(post.id)} className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-white hover:bg-gray-700 transition">
                        <LinkIcon className="w-4 h-4" /> Copy link
                      </button>
                      {post.user?.id === user?.id ? (
                        <button onClick={() => startEditPostCaption(post)} className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-white hover:bg-gray-700 transition">
                          <Pencil className="w-4 h-4" /> Edit caption
                        </button>
                      ) : null}
                      {post.user?.id === user?.id ? (
                        <button onClick={() => handleDeletePost(post.id)} className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-400 hover:bg-gray-700 transition">
                          <Trash2 className="w-4 h-4" /> Delete
                        </button>
                      ) : (
                        <button onClick={() => setMenuOpen(null)} className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-400 hover:bg-gray-700 transition">
                          <Flag className="w-4 h-4" /> Report
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Post Image */}
                {(() => {
                  const mediaUrls = getPostMediaUrls(post);
                  if (mediaUrls.length === 0) return null;

                  return (
                    <div className="relative">
                      <div
                        ref={(el) => {
                          if (el) postMediaRefs.current[post.id] = el;
                        }}
                        className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide"
                        onScroll={(e) => handlePostMediaScroll(post.id, e)}
                      >
                        {mediaUrls.map((url, idx) => (
                          isVideoUrl(url) ? (
                            <video
                              key={`${post.id}-video-${idx}`}
                              src={url}
                              className="block w-full shrink-0 max-h-[60vh] object-contain snap-start bg-black"
                              controls
                              autoPlay
                              muted
                              loop
                            />
                          ) : (
                            <img
                              key={`${post.id}-img-${idx}`}
                              src={url}
                              alt="Post"
                              className="block w-full shrink-0 max-h-[60vh] object-contain snap-start"
                            />
                          )
                        ))}
                      </div>
                      {mediaUrls.length > 1 && (
                        <div className="absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
                          {(postMediaIndexes[post.id] || 0) + 1}/{mediaUrls.length}
                        </div>
                      )}
                      {mediaUrls.length > 1 && (
                        <>
                          <button
                            type="button"
                            onClick={() => navigatePostMedia(post.id, -1, mediaUrls.length)}
                            className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/55 rounded-full text-white hover:bg-black/75"
                            aria-label="Previous media"
                          >
                            {'<'}
                          </button>
                          <button
                            type="button"
                            onClick={() => navigatePostMedia(post.id, 1, mediaUrls.length)}
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

                {/* Caption below media and above actions */}
                {post.caption && (
                  <div className="px-4 pt-3 text-white text-sm whitespace-pre-wrap">
                    <span className="font-semibold mr-1">{post.user?.name}</span>
                    {post.user?.is_approved && <VerifiedBadge size="xs" className="inline mr-1" />}
                    <span>{renderTextWithMentions(post.caption, handleMentionClick)}</span>
                  </div>
                )}

                {editingPostId === post.id && (
                  <div className="px-4 pt-3">
                    <div className="rounded-xl border border-gray-700 bg-gray-800 p-3">
                      <textarea
                        value={editingPostCaption}
                        onChange={(e) => setEditingPostCaption(e.target.value)}
                        rows={3}
                        className="w-full resize-none bg-transparent border-0 focus:ring-0 text-white placeholder-gray-500 text-sm"
                        placeholder="Edit your caption"
                      />
                      <div className="mt-3 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={cancelEditPostCaption}
                          className="px-3 py-1.5 rounded-lg bg-gray-700 text-white text-sm hover:bg-gray-600"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={savePostCaption}
                          disabled={savingPostCaption}
                          className="px-3 py-1.5 rounded-lg text-white text-sm disabled:opacity-50 transition"
                          style={{ backgroundColor: '#5DADE2' }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#4A9FD5'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#5DADE2'}
                        >
                          {savingPostCaption ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Post Actions */}
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => handleLike(post.id)}
                        className={`flex items-center gap-1 transition ${post.is_liked ? 'text-red-500' : 'text-gray-400 hover:text-white'}`}
                      >
                        <Heart className={`w-6 h-6 ${post.is_liked ? 'fill-current' : ''}`} />
                      </button>
                      <button
                        onClick={() => toggleComments(post.id)}
                        className="flex items-center gap-1 text-gray-400 hover:text-white transition"
                      >
                        <MessageCircle className="w-6 h-6" />
                      </button>
                      <button
                        onClick={() => handleShare(post)}
                        className="flex items-center gap-1 text-gray-400 hover:text-white transition"
                      >
                        <Share2 className="w-6 h-6" />
                      </button>
                    </div>
                    <button
                      onClick={() => handleSave(post.id)}
                      className={`transition ${savedPosts[post.id] ? 'text-white' : 'text-gray-400 hover:text-white'}`}
                    >
                      {savedPosts[post.id] ? <BookmarkCheck className="w-6 h-6 fill-current" /> : <Bookmark className="w-6 h-6" />}
                    </button>
                  </div>

                  {/* Likes Count */}
                  {post.likes_count > 0 && (
                    <p className="text-sm font-semibold text-white mb-2">
                      {post.likes_count} {post.likes_count === 1 ? 'like' : 'likes'}
                    </p>
                  )}

                  {/* Comments Preview */}
                  {post.comments_count > 0 && !expandedComments[post.id] && (
                    <button 
                      onClick={() => toggleComments(post.id)}
                      className="text-sm text-gray-500 hover:text-gray-300"
                    >
                      View all {post.comments_count} comments
                    </button>
                  )}

                  {/* Expanded Comments */}
                  {expandedComments[post.id] && (
                    <div className="mt-3 space-y-3 border-t border-gray-800 pt-3">
                      {loadingComments[post.id] ? (
                        <div className="flex justify-center py-2">
                          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                        </div>
                      ) : (
                        <>
                          {(postComments[post.id] || []).map((comment) => (
                            <div key={comment.id} className="flex gap-2">
                              <img
                                src={getAvatarUrl(comment.user)}
                                alt={comment.user?.name}
                                className="w-8 h-8 rounded-full object-cover"
                              />
                              <div className="flex-1 bg-gray-800 rounded-lg px-3 py-2">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-0.5">
                                    <span className="font-semibold text-sm text-white">
                                      {comment.user?.name}
                                    </span>
                                    {comment.user?.is_approved && <VerifiedBadge size="xs" />}
                                    {isCreatorUser(comment.user) && <CreatorBadge size="xs" />}
                                  </div>
                                  {comment.user?.id === user?.id && (
                                    <div className="flex items-center gap-2 text-xs">
                                      <button
                                        onClick={() => startEditComment(post.id, comment)}
                                        className="text-gray-400 hover:text-white"
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteComment(post.id, comment.id)}
                                        disabled={commentActionLoading[`${post.id}-${comment.id}`]}
                                        className="text-gray-400 hover:text-red-400 disabled:opacity-50"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                                {editingComments[`${post.id}-${comment.id}`] ? (
                                  <div className="mt-1">
                                    <input
                                      type="text"
                                      value={editingCommentText[`${post.id}-${comment.id}`] || ''}
                                      onChange={(e) => setEditingCommentText(prev => ({ ...prev, [`${post.id}-${comment.id}`]: e.target.value }))}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') saveEditComment(post.id, comment.id)
                                        if (e.key === 'Escape') cancelEditComment(post.id, comment.id)
                                      }}
                                      className="w-full bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-sm text-white"
                                    />
                                    <div className="mt-2 flex items-center gap-2">
                                      <button
                                        onClick={() => saveEditComment(post.id, comment.id)}
                                        disabled={commentActionLoading[`${post.id}-${comment.id}`] || !(editingCommentText[`${post.id}-${comment.id}`] || '').trim()}
                                        className="px-2 py-1 text-xs bg-white hover:bg-gray-200 rounded text-black disabled:opacity-50"
                                      >
                                        <span className="inline-flex items-center gap-1"><Check className="w-3 h-3" />Save</span>
                                      </button>
                                      <button
                                        onClick={() => cancelEditComment(post.id, comment.id)}
                                        className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-white"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-sm text-gray-300">{comment.content}</p>
                                )}

                                <div className="mt-2 flex items-center gap-4 text-xs text-gray-400">
                                  <button
                                    onClick={() => handleToggleCommentLike(post.id, comment.id)}
                                    className={`inline-flex items-center gap-1 hover:text-white ${comment.is_liked ? 'text-red-400' : ''}`}
                                  >
                                    <Heart className={`w-3.5 h-3.5 ${comment.is_liked ? 'fill-current' : ''}`} />
                                    {Number(comment.likes_count || 0) > 0 ? comment.likes_count : 'Like'}
                                  </button>
                                  <button
                                    onClick={() => toggleReplyBox(post.id, comment.id)}
                                    className="hover:text-white"
                                  >
                                    Reply
                                  </button>
                                  {Number(comment.replies_count || 0) > 0 && (
                                    <button
                                      onClick={() => handleLoadReplies(post.id, comment.id)}
                                      className="hover:text-white"
                                    >
                                      {loadingReplies[getThreadKey(post.id, comment.id)]
                                        ? 'Loading...'
                                        : expandedReplyThreads[getThreadKey(post.id, comment.id)]
                                          ? 'Hide replies'
                                          : `View replies (${comment.replies_count})`}
                                    </button>
                                  )}
                                </div>

                                {(activeReplyBoxes[getThreadKey(post.id, comment.id)] || expandedReplyThreads[getThreadKey(post.id, comment.id)] || (comment.replies || []).length > 0) && (
                                  <div className="mt-2 space-y-2 pl-2 border-l border-gray-700">
                                    {(comment.replies || []).map((reply) => (
                                      <div key={reply.id} className="flex gap-2">
                                        <img
                                          src={getAvatarUrl(reply.user)}
                                          alt={reply.user?.name}
                                          className="w-7 h-7 rounded-full object-cover"
                                        />
                                        <div className="flex-1 bg-gray-700 rounded-lg px-2.5 py-2">
                                          <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-0.5">
                                              <span className="font-semibold text-xs text-white">{reply.user?.name}</span>
                                              {reply.user?.is_approved && <VerifiedBadge size="xs" />}
                                              {isCreatorUser(reply.user) && <CreatorBadge size="xs" />}
                                            </div>
                                            {reply.user?.id === user?.id && (
                                              <button
                                                onClick={() => handleDeleteComment(post.id, reply.id, comment.id)}
                                                disabled={commentActionLoading[`${post.id}-${reply.id}`]}
                                                className="text-gray-400 hover:text-red-400 disabled:opacity-50"
                                              >
                                                <Trash2 className="w-3.5 h-3.5" />
                                              </button>
                                            )}
                                          </div>
                                          <p className="text-xs text-gray-200 mt-0.5">{reply.content}</p>
                                          <div className="mt-1.5 flex items-center gap-4 text-[11px] text-gray-400">
                                            <button
                                              onClick={() => handleToggleCommentLike(post.id, reply.id, comment.id)}
                                              className={`inline-flex items-center gap-1 hover:text-white ${reply.is_liked ? 'text-red-400' : ''}`}
                                            >
                                              <Heart className={`w-3 h-3 ${reply.is_liked ? 'fill-current' : ''}`} />
                                              {Number(reply.likes_count || 0) > 0 ? reply.likes_count : 'Like'}
                                            </button>
                                            <button
                                              onClick={() => toggleReplyBox(post.id, comment.id)}
                                              className="hover:text-white"
                                            >
                                              Reply
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    ))}

                                    {activeReplyBoxes[getThreadKey(post.id, comment.id)] && (
                                      <div className="flex gap-2 pt-1">
                                        <img
                                          src={getAvatarUrl(user)}
                                          alt={user?.name}
                                          className="w-7 h-7 rounded-full object-cover"
                                        />
                                        <div className="flex-1 relative min-w-0">
                                          <input
                                            type="text"
                                            value={replyInputs[getThreadKey(post.id, comment.id)] || ''}
                                            onChange={(e) => setReplyInputs(prev => ({ ...prev, [getThreadKey(post.id, comment.id)]: e.target.value }))}
                                            onKeyDown={(e) => e.key === 'Enter' && handleAddReply(post.id, comment.id)}
                                            placeholder={`Reply to ${comment.user?.username || comment.user?.name}...`}
                                            className="w-full bg-gray-800 border-0 rounded-full pl-3 pr-10 py-1.5 text-xs text-white placeholder-gray-500 focus:ring-2 focus:ring-gray-600"
                                          />
                                          <button
                                            onClick={() => handleAddReply(post.id, comment.id)}
                                            disabled={!replyInputs[getThreadKey(post.id, comment.id)]?.trim()}
                                            className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 text-white hover:bg-gray-700 rounded-full disabled:opacity-50"
                                          >
                                            <Send className="w-4 h-4" />
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                      
                      {/* Add Comment */}
                      <div className="flex gap-2 mt-2">
                        <img
                          src={getAvatarUrl(user)}
                          alt={user?.name}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                        <div className="flex-1 relative min-w-0">
                          <input
                            type="text"
                            value={commentInputs[post.id] || ''}
                            onChange={(e) => setCommentInputs({ ...commentInputs, [post.id]: e.target.value })}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddComment(post.id)}
                            placeholder="Add a comment..."
                            className="w-full bg-gray-800 border-0 rounded-full pl-4 pr-12 py-2 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-gray-600"
                          />
                          <button
                            onClick={() => handleAddComment(post.id)}
                            disabled={!commentInputs[post.id]?.trim()}
                            className="absolute right-1 top-1/2 -translate-y-1/2 p-2 text-white hover:bg-gray-700 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Send className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            </div>
          )}
        </div>

        <aside className="hidden lg:block sticky top-20 space-y-4">
          <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-card)' }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>WolloGram Playbook</h3>
                <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                  Build your profile energy in 3 moves: post something real, mention a friend, and start one fresh chat.
                </p>
              </div>
              <div className="shrink-0 rounded-lg p-2" style={{ backgroundColor: 'rgba(93, 173, 226, 0.15)' }}>
                <Sparkles className="w-4 h-4" style={{ color: '#7EC8F0' }} />
              </div>
            </div>

            <div className="mt-3 space-y-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              <div className="rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--color-bg-elevated)' }}>1. Post a photo with a short caption</div>
              <div className="rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--color-bg-elevated)' }}>2. Mention someone with @username</div>
              <div className="rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--color-bg-elevated)' }}>3. Reply to a story to start a conversation</div>
            </div>
          </div>

          <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-card)' }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Daily Discovery</h3>
                <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                  Your feed refreshes with recent posts only and now mixes in public discovery photos from other students.
                </p>
              </div>
              <div className="shrink-0 rounded-lg bg-cyan-500/15 p-2">
                <Compass className="w-4 h-4 text-cyan-300" />
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs">
              <div className="rounded-lg py-2" style={{ backgroundColor: 'var(--color-bg-elevated)' }}>
                <p className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>48h</p>
                <p style={{ color: 'var(--color-text-secondary)' }}>Feed window</p>
              </div>
              <div className="rounded-lg py-2" style={{ backgroundColor: 'var(--color-bg-elevated)' }}>
                <p className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>{suggestions.length}</p>
                <p style={{ color: 'var(--color-text-secondary)' }}>People to explore</p>
              </div>
            </div>

            <button
              onClick={() => navigate('/search')}
              className="mt-3 w-full rounded-lg text-white text-xs font-semibold py-2 transition"
              style={{ backgroundColor: 'rgba(93, 173, 226, 0.9)' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#5DADE2'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(93, 173, 226, 0.9)'}
            >
              Explore More Profiles
            </button>
          </div>

          <div className="px-2 text-center text-[12px] leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>
            <p className="whitespace-nowrap">Copyright © 2026 WolloGram. All rights reserved.</p>
            <p className="whitespace-nowrap">
              Developed by{' '}
              <a
                href="https://t.me/M0nst3r1"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold underline underline-offset-2 hover:opacity-80"
                style={{ color: 'var(--color-text-primary)' }}
              >
                Abel Tewodros
              </a>
              .
            </p>
          </div>

          {suggestions.slice(0, 3).length > 0 && (
            <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-card)' }}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>People Around You</h3>
              <div className="space-y-3">
                {suggestions.slice(0, 3).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => navigate(`/profile/${s.id}`)}
                    className="w-full flex items-center gap-3 rounded-xl px-2 py-2 text-left transition"
                    style={{ backgroundColor: 'transparent' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg-elevated)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <img src={getAvatarUrl(s)} alt={s.name} className="w-10 h-10 rounded-full object-cover" />
                    <div className="min-w-0">
                      <p className="text-sm truncate flex items-center gap-1" style={{ color: 'var(--color-text-primary)' }}>{s.name} {isCreatorUser(s) && <CreatorBadge size="xs" />}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>{s.department_name || 'Campus student'}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

        </aside>
      </div>
      </div>

      {/* Share to Chat Modal */}
      {shareModalPost && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end md:items-center justify-center p-0 md:p-6" onClick={() => setShareModalPost(null)}>
          <div
            className="bg-[#1f232e] w-full h-[88vh] md:h-auto md:max-w-175 rounded-t-2xl md:rounded-3xl md:max-h-[78vh] flex flex-col min-h-0 overflow-hidden border border-gray-800/80 shadow-2xl"
            onClick={e => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 border-b border-gray-800 flex items-center justify-between shrink-0">
              <button onClick={() => setShareModalPost(null)} className="p-1.5 hover:bg-gray-800 rounded-full" aria-label="Close share modal">
                <X className="w-5 h-5 text-gray-400" />
              </button>
              <h3 className="text-white font-semibold text-lg">Share</h3>
              <div className="w-8" />
            </div>

            {/* Search */}
            <div className="px-4 py-3 border-b border-gray-800 shrink-0">
              <input
                type="text"
                value={shareSearch}
                onChange={e => {
                  setShareSearch(e.target.value)
                  if (e.target.value.trim()) setShowAllShareChats(true)
                }}
                placeholder="Search"
                className="w-full bg-gray-800/90 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Desktop share layout */}
            <div className="hidden md:flex flex-col min-h-0 flex-1">
              <div className="overflow-y-auto flex-1 min-h-0 p-5">
                {loadingChats ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                  </div>
                ) : filteredChats.length === 0 ? (
                  <div className="text-center py-12 text-gray-400 text-sm">No chats found</div>
                ) : (
                  <div className="grid grid-cols-4 gap-x-5 gap-y-6">
                    {filteredChats.slice(0, showAllShareChats || shareSearch.trim() ? filteredChats.length : 12).map(conv => (
                      <button
                        key={conv.id}
                        onClick={() => sendSharedPostToChat(conv.id)}
                        disabled={sendingTo === conv.id}
                        className="group text-center disabled:opacity-60"
                        title={getConversationName(conv)}
                      >
                        <div className="relative mx-auto w-18 h-18 rounded-full overflow-hidden border border-gray-700 group-hover:border-blue-400 transition">
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

            {/* Mobile grid layout */}
            <div className="md:hidden flex flex-col min-h-0 flex-1">
              <div className="px-4 pt-2">
                <div className="w-10 h-1 rounded-full bg-gray-600 mx-auto mb-3" />
              </div>

              <div className="overflow-y-auto flex-1 min-h-0 px-4 pb-4 overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
                {loadingChats ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                  </div>
                ) : shareChatList.length === 0 ? (
                  <div className="text-center py-12 text-gray-400 text-sm">
                    {shareSearch ? 'No chats found' : 'No conversations yet'}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-x-4 gap-y-6">
                    {shareChatList.map(conv => (
                      <button
                        key={conv.id}
                        onClick={() => sendSharedPostToChat(conv.id)}
                        disabled={sendingTo === conv.id}
                        className="text-center disabled:opacity-60"
                      >
                        <div className="relative mx-auto w-18 h-18 rounded-full overflow-hidden border border-gray-700">
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
        open={Boolean(confirmDialog)}
        title={confirmDialog?.title || 'Confirm Action'}
        message={confirmDialog?.message || ''}
        confirmLabel={confirmDialog?.confirmLabel || 'Confirm'}
        tone={confirmDialog?.tone || 'danger'}
        loading={confirmLoading}
        onClose={closeConfirmDialog}
        onConfirm={submitConfirmDialog}
      />

    </div>
  )
}
