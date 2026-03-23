import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../context/useSocket'
import { conversations, messages, users, media, stories } from '../api'
import StoryViewer from '../components/StoryViewer'
import { Skeleton } from '../components/Skeleton'
import { SHARED_POST_MESSAGE, SHARED_STORY_MESSAGE } from '../utils/chatShares'
import { resolveMediaUrl } from '../utils/media'
import { getAvatarUrl } from '../utils/avatar'
import { 
  Send, Info, Heart, Smile, PenSquare, 
  ChevronDown, X, Check, CheckCheck, Edit2, 
  Trash2, Users, Search, Paperclip, Mic, ArrowLeft, Copy, Play, Pause, Square,
  Reply, Forward, MoreVertical, Loader2, Download
} from 'lucide-react'

export default function Chat() {
  const { conversationId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const { 
    isUserOnline, joinConversation, leaveConversation, 
    sendTyping, getTypingUsers, emitNewMessage, emitMessageEdited, 
    emitMessageDeleted, emitReaction, emitMessageStatus, socket, connected,
    setActiveConversation, setUnreadChatCount,
    emitConversationRead
  } = useSocket()
  
  // State
  const [convList, setConvList] = useState([])
  const [activeConv, setActiveConv] = useState(null)
  const [msgList, setMsgList] = useState([])
  const [newMsg, setNewMsg] = useState('')
  const [loading, setLoading] = useState(true)
  const [showNewChat, setShowNewChat] = useState(false)
  const [showGroupCreate, setShowGroupCreate] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [showEmojiPicker, setShowEmojiPicker] = useState(null)
  const [editingMessage, setEditingMessage] = useState(null)
  const [editContent, setEditContent] = useState('')
  const [showMessageMenu, setShowMessageMenu] = useState(null)
  const [selectedUsers, setSelectedUsers] = useState([])
  const [groupName, setGroupName] = useState('')
  const [uploadingMedia, setUploadingMedia] = useState(false)
  const [showConvInfo, setShowConvInfo] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [globalSearch, setGlobalSearch] = useState('')
  const [replyingTo, setReplyingTo] = useState(null)
  const [showInputEmoji, setShowInputEmoji] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [playingVoiceId, setPlayingVoiceId] = useState(null)
  const [voiceProgress, setVoiceProgress] = useState({})
  const [voiceDuration, setVoiceDuration] = useState({})
  const [forwardingMessage, setForwardingMessage] = useState(null)
  const [forwardSearch, setForwardSearch] = useState('')
  const [forwardingTo, setForwardingTo] = useState(null)
  const [activeActionMessageId, setActiveActionMessageId] = useState(null)
  const [hoveredMessageId, setHoveredMessageId] = useState(null)
  const [storiesByUser, setStoriesByUser] = useState([])
  const [viewingStoryUserIndex, setViewingStoryUserIndex] = useState(null)
  const [showProfilePreview, setShowProfilePreview] = useState(false)
  const [profilePreview, setProfilePreview] = useState(null)
  const [loadingProfilePreview, setLoadingProfilePreview] = useState(false)
  const [showRealtimeWarning, setShowRealtimeWarning] = useState(false)
  const [showConvActionsMenu, setShowConvActionsMenu] = useState(false)
  const [blockedUserIds, setBlockedUserIds] = useState(new Set())
  const [confirmModal, setConfirmModal] = useState(null)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [actionToast, setActionToast] = useState(null)
  
  const messagesEndRef = useRef(null)
  const fileInputRef = useRef(null)
  const audioCaptureInputRef = useRef(null)
  const typingTimeoutRef = useRef(null)
  const prevConvIdRef = useRef(null)
  const directStartHandledRef = useRef(false)
  const longPressTimerRef = useRef(null)
  const longPressTriggeredRef = useRef(false)
  const mediaRecorderRef = useRef(null)
  const recordingStreamRef = useRef(null)
  const recordingChunksRef = useRef([])
  const recordingTimerRef = useRef(null)
  const recordingCancelledRef = useRef(false)
  const refreshConversationsTimerRef = useRef(null)
  const audioRefs = useRef({})
  const confirmActionRef = useRef(null)

  const commonEmojis = ['👍', '❤️', '😂', '😮', '😢', '😠', '🔥', '🎉', '👏', '🙏', '😍', '🤔', '😊', '😎', '🤣', '💯']

  const getPostMediaUrls = (post) => {
    const list = Array.isArray(post?.media_urls) && post.media_urls.length > 0
      ? post.media_urls
      : (post?.image_url ? [post.image_url] : [])

    return list.map((path) => resolveMediaUrl(path))
  }

  const isSharedStoryMessage = (msg) => (
    Boolean(msg?.story_id) && (
      msg?.story_context === 'shared' ||
      String(msg?.content || '').trim() === SHARED_STORY_MESSAGE
    )
  )

  const isSharedPostMessage = (msg) => (
    Boolean(msg?.post_id) && (
      msg?.post_context === 'shared' ||
      String(msg?.content || '').trim() === SHARED_POST_MESSAGE
    )
  )

  const getConversationPreviewText = (lastMessage) => {
    const content = String(lastMessage?.content || '').trim()
    if (content === SHARED_STORY_MESSAGE) return 'Shared a story'
    if (content === SHARED_POST_MESSAGE) return 'Shared a post'
    return content
  }

  const appendMessageIfMissing = useCallback((incomingMessage, extraFields = {}) => {
    if (!incomingMessage?.id) return
    setMsgList(prev => {
      if (prev.some(m => String(m.id) === String(incomingMessage.id))) {
        return prev
      }
      return [...prev, { ...incomingMessage, ...extraFields }]
    })
  }, [])

  const requestConversationsRefresh = useCallback((delayMs = 140) => {
    if (refreshConversationsTimerRef.current) {
      clearTimeout(refreshConversationsTimerRef.current)
    }

    refreshConversationsTimerRef.current = setTimeout(() => {
      loadConversations()
    }, delayMs)
  }, [])

  // Load conversations on mount.
  useEffect(() => { loadConversations(); loadStories() }, [])

  useEffect(() => {
    const handleFocus = () => loadStories()
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [])

  useEffect(() => {
    if (!user?.id) return
    loadBlockedUsers()
  }, [user?.id])

  useEffect(() => {
    if (!actionToast) return
    const timer = setTimeout(() => setActionToast(null), 3000)
    return () => clearTimeout(timer)
  }, [actionToast])
  
  // Handle conversation change
  useEffect(() => {
    if (prevConvIdRef.current && prevConvIdRef.current !== conversationId) {
      leaveConversation(prevConvIdRef.current)
    }
    setShowSearch(false)
    setGlobalSearch('')
    if (conversationId) {
      loadMessages(conversationId)
      joinConversation(conversationId)
      setActiveConversation(conversationId)
      prevConvIdRef.current = conversationId
    } else {
      setActiveConversation(null)
    }
    return () => {
      if (conversationId) leaveConversation(conversationId)
      setActiveConversation(null)
    }
  }, [conversationId])

  // Join all conversation rooms while on the chat page so typing/new-message
  // events can update conversation rows even when a thread is not open.
  useEffect(() => {
    convList.forEach((conv) => joinConversation(conv.id))

    return () => {
      convList.forEach((conv) => leaveConversation(conv.id))
    }
  }, [convList, joinConversation, leaveConversation])

  // Reset one-time direct-start guard when navigation state changes
  useEffect(() => {
    directStartHandledRef.current = false
  }, [location.key])

  // Open a direct chat when coming from profile Message button
  useEffect(() => {
    const targetId = Number(location.state?.startChatUserId)
    if (!targetId || !user?.id) return
    if (targetId === user.id) return
    if (conversationId) return
    if (loading) return
    if (directStartHandledRef.current) return

    const existingPrivate = convList.find((conv) => {
      if (conv.type !== 'private') return false
      const memberIds = (conv.members || []).map((m) => m.id)
      return memberIds.includes(user.id) && memberIds.includes(targetId)
    })

    if (existingPrivate) {
      directStartHandledRef.current = true
      navigate(`/c/${existingPrivate.id}`, { replace: true })
      return
    }

    directStartHandledRef.current = true
    conversations.create({ type: 'private', user_ids: [targetId] })
      .then((res) => {
        const newConvId = res.data?.conversation?.id
        if (newConvId) navigate(`/c/${newConvId}`, { replace: true })
      })
      .catch((err) => {
        console.error('Failed to start direct conversation', err)
        directStartHandledRef.current = false
      })
  }, [location.state, conversationId, loading, convList, user?.id, navigate])
  
  // Auto-scroll to bottom
  useEffect(() => { 
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) 
  }, [msgList])

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
      if (refreshConversationsTimerRef.current) clearTimeout(refreshConversationsTimerRef.current)
      Object.values(audioRefs.current).forEach(audio => audio?.pause?.())
      if (recordingStreamRef.current) {
        recordingStreamRef.current.getTracks().forEach(track => track.stop())
        recordingStreamRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (connected) {
      setShowRealtimeWarning(false)
      return
    }

    const timer = setTimeout(() => {
      setShowRealtimeWarning(true)
    }, 4000)

    return () => clearTimeout(timer)
  }, [connected])

  // Listen for real-time events
  useEffect(() => {
    if (!socket) return

    const handleNewMessage = ({ conversationId: convId, message }) => {
      if (String(convId) === String(conversationId)) {
        if (message?.story_id || message?.post_id) {
          void loadMessages(convId)
          return
        }
        // Chat is open — add message and mark as seen
        appendMessageIfMissing(message, { status: 'seen' })
        emitMessageStatus(convId, message.id, 'seen')
        conversations.markSeen(convId).then((res) => {
          setUnreadChatCount(res.data?.total_unread ?? 0)
          emitConversationRead(convId)
          requestConversationsRefresh(80)
        }).catch(() => {})
      } else {
        // Not the active conversation — just refresh list
        requestConversationsRefresh(100)
      }
    }

    const handleMessageEdited = ({ conversationId: convId, messageId, content }) => {
      if (String(convId) === String(conversationId)) {
        setMsgList(prev => prev.map(m => 
          m.id === messageId ? { ...m, content, edited_at: new Date().toISOString() } : m
        ))
      }
    }

    const handleMessageDeleted = ({ conversationId: convId, messageId }) => {
      if (String(convId) === String(conversationId)) {
        setMsgList(prev => prev.map(m => 
          m.id === messageId ? { ...m, content: '[Message deleted]', deleted: true } : m
        ))
      }
    }

    const handleReaction = ({ conversationId: convId, messageId, emoji, userId, action }) => {
      if (String(convId) === String(conversationId)) {
        setMsgList(prev => prev.map(m => {
          if (m.id !== messageId) return m
          let reactions = [...(m.reactions || [])]
          if (action === 'add') {
            reactions.push({ emoji, user_id: userId })
          } else {
            reactions = reactions.filter(r => !(r.emoji === emoji && r.user_id === userId))
          }
          return { ...m, reactions }
        }))
      }
    }

    const handleMessageStatus = ({ conversationId: convId, messageId, status }) => {
      if (String(convId) === String(conversationId)) {
        setMsgList(prev => prev.map(m => 
          m.id === messageId ? { ...m, status } : m
        ))
      }
    }

    // When another user marks messages as seen, refresh conv list for read receipts
    const handleUnreadUpdated = ({ conversationId: convId, userId: seenByUserId }) => {
      // If messages in the currently-open conversation were seen by someone else
      if (String(convId) === String(conversationId) && String(seenByUserId) !== String(user.id)) {
        // Refresh messages to show updated read receipts
        setMsgList(prev => prev.map(m =>
          String(m.user_id) === String(user.id) ? { ...m, status: 'seen' } : m
        ))
      }
      // Always refresh conversation list to update per-conv badges
      requestConversationsRefresh(80)
    }

    // Server pushes this for recipients when a non-active conversation gets updates.
    const handleUnreadRefresh = () => {
      requestConversationsRefresh(80)
    }

    socket.on('message:new', handleNewMessage)
    socket.on('message:edited', handleMessageEdited)
    socket.on('message:deleted', handleMessageDeleted)
    socket.on('message:reaction', handleReaction)
    socket.on('message:status', handleMessageStatus)
    socket.on('conversation:unread_updated', handleUnreadUpdated)
    socket.on('unread:refresh', handleUnreadRefresh)

    return () => {
      socket.off('message:new', handleNewMessage)
      socket.off('message:edited', handleMessageEdited)
      socket.off('message:deleted', handleMessageDeleted)
      socket.off('message:reaction', handleReaction)
      socket.off('message:status', handleMessageStatus)
      socket.off('conversation:unread_updated', handleUnreadUpdated)
      socket.off('unread:refresh', handleUnreadRefresh)
    }
  }, [socket, conversationId, user?.id, appendMessageIfMissing, requestConversationsRefresh])

  const loadConversations = async () => {
    try {
      const res = await conversations.list()
      const convs = Array.isArray(res.data)
        ? res.data
        : (res.data?.data || [])
      setConvList(convs)
      // Global unread = sum of all per-conv unread_count (already DB-driven from backend)
      const totalUnread = convs.reduce((sum, c) => sum + Number(c.unread_count || 0), 0)
      setUnreadChatCount(totalUnread)
    } catch (err) {
      console.error('Failed to load conversations', err)
    } finally {
      setLoading(false)
    }
  }

  const loadStories = async () => {
    try {
      const res = await stories.getAll()
      setStoriesByUser(Array.isArray(res.data) ? res.data : [])
    } catch (err) {
      console.error('Failed to load stories in chat', err)
    }
  }

  const loadBlockedUsers = async () => {
    if (!user?.id) return
    try {
      const res = await users.getBlocked(user.id)
      const list = res.data?.blockedUsers || []
      setBlockedUserIds(new Set(list.map((u) => u.id)))
    } catch (err) {
      console.error('Failed to load blocked users', err)
    }
  }

  const showStyledConfirm = ({ title, message, confirmLabel = 'Confirm', tone = 'danger', onConfirm }) => {
    confirmActionRef.current = onConfirm
    setConfirmModal({ title, message, confirmLabel, tone })
  }

  const closeStyledConfirm = () => {
    if (confirmLoading) return
    confirmActionRef.current = null
    setConfirmModal(null)
  }

  const submitStyledConfirm = async () => {
    if (!confirmActionRef.current || confirmLoading) return
    try {
      setConfirmLoading(true)
      await confirmActionRef.current()
    } finally {
      setConfirmLoading(false)
      confirmActionRef.current = null
      setConfirmModal(null)
    }
  }

  const getStoryInfoForUser = (userId) => {
    return storiesByUser.find(s => String(s.user?.id) === String(userId)) || null
  }

  const hasUnviewedStory = (userId) => {
    const storyInfo = getStoryInfoForUser(userId)
    return Boolean(storyInfo?.has_unviewed)
  }

  const openStoryFromChat = (userId, event) => {
    if (event) event.stopPropagation()
    const index = storiesByUser.findIndex(s => String(s.user?.id) === String(userId))
    if (index >= 0) setViewingStoryUserIndex(index)
  }

  const closeStoryViewer = () => {
    setViewingStoryUserIndex(null)
    loadStories()
  }

  const loadMessages = async (id) => {
    try {
      const convRes = await conversations.get(id)
      setActiveConv(convRes.data.conversation || convRes.data)
      const msgRes = await messages.list(id, { per_page: 50 })
      const msgData = msgRes.data.data || []
      const sortedMessages = msgData.sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )

      const unseenOnLoad = sortedMessages.filter(m => m.user_id !== user.id && m.status !== 'seen')

      // Set messages — mark unseen as 'seen' locally
      setMsgList(unseenOnLoad.length > 0
        ? sortedMessages.map(m => m.user_id !== user.id && m.status !== 'seen' ? { ...m, status: 'seen' } : m)
        : sortedMessages
      )

      if (unseenOnLoad.length > 0) {
        // Optimistic badge clear
        setConvList(prev => prev.map(c =>
          String(c.id) === String(id) ? { ...c, unread_count: 0 } : c
        ))
        // Emit socket status for read receipts
        unseenOnLoad.forEach(m => emitMessageStatus(id, m.id, 'seen'))
        // Persist to DB — response includes total_unread across all conversations
        const markRes = await conversations.markSeen(id)
        setUnreadChatCount(markRes.data?.total_unread ?? 0)
        emitConversationRead(id)
        // Refresh conversation list for accurate per-conv badges
        await loadConversations()
      }
    } catch (err) {
      console.error('Failed to load messages', err)
    }
  }

  const handleTyping = useCallback(() => {
    if (!conversationId) return
    sendTyping(conversationId, true)
    
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      sendTyping(conversationId, false)
    }, 3000)
  }, [conversationId, sendTyping])

  const sendMessage = async e => {
    e.preventDefault()
    if (!newMsg.trim() || !conversationId) return
    if (isActivePrivateChatBlocked()) return
    
    // Clear typing indicator
    sendTyping(conversationId, false)
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    
    try {
      // Build message content with reply reference if replying
      let content = newMsg
      if (replyingTo) {
        content = `[Reply to: ${replyingTo.user?.name || 'message'}] ${replyingTo.content.substring(0, 50)}${replyingTo.content.length > 50 ? '...' : ''}\n---\n${newMsg}`
      }
      
      const res = await messages.send(conversationId, { content })
      const newMessage = res.data.data
      appendMessageIfMissing(newMessage)
      setNewMsg('')
      setReplyingTo(null)
      
      // Emit to others via socket — include memberIds so server can push unread:refresh
      const memberIds = res.data?.member_ids || (activeConv?.members || []).map(m => m.id)
      emitNewMessage(conversationId, newMessage, memberIds)
      
      // Update conversation list
      requestConversationsRefresh(120)
    } catch (err) {
      console.error('Failed to send message', err)
    }
  }

  const editMessage = async (msgId) => {
    if (!editContent.trim()) return
    try {
      await messages.edit(msgId, editContent)
      setMsgList(prev => prev.map(m => 
        m.id === msgId ? { ...m, content: editContent, edited_at: new Date().toISOString() } : m
      ))
      emitMessageEdited(conversationId, msgId, editContent)
      setEditingMessage(null)
      setEditContent('')
    } catch (err) {
      console.error('Failed to edit message', err)
    }
  }

  const deleteMessage = async (msgId) => {
    try {
      await messages.delete(msgId)
      setMsgList(prev => prev.map(m => 
        m.id === msgId ? { ...m, content: '[Message deleted]', deleted: true } : m
      ))
      emitMessageDeleted(conversationId, msgId)
      setShowMessageMenu(null)
    } catch (err) {
      console.error('Failed to delete message', err)
    }
  }

  const addReaction = async (msgId, emoji) => {
    try {
      await messages.react(msgId, emoji)
      setMsgList(prev => prev.map(m => {
        if (m.id !== msgId) return m
        const reactions = [...(m.reactions || []), { emoji, user_id: user.id }]
        return { ...m, reactions }
      }))
      emitReaction(conversationId, msgId, emoji, 'add')
      setShowEmojiPicker(null)
      setActiveActionMessageId(null)
    } catch (err) {
      console.error('Failed to add reaction', err)
    }
  }

  const removeReaction = async (msgId, emoji) => {
    try {
      await messages.removeReaction(msgId, emoji)
      setMsgList(prev => prev.map(m => {
        if (m.id !== msgId) return m
        const reactions = (m.reactions || []).filter(r => 
          !(String(r.emoji) === String(emoji) && String(r.user_id) === String(user.id))
        )
        return { ...m, reactions }
      }))
      emitReaction(conversationId, msgId, emoji, 'remove')
    } catch (err) {
      console.error('Failed to remove reaction', err)
    }
  }

  const uploadAndSendMedia = async (file) => {
    if (!file || !conversationId) return
    if (isActivePrivateChatBlocked()) return

    const extension = (file.name.split('.').pop() || '').toLowerCase()
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'heif', 'avif', 'jfif']
    const isImageByExtension = imageExtensions.includes(extension)
    const isVoiceByExtension = ['mp3', 'wav', 'webm', 'ogg', 'm4a', 'aac'].includes(extension)
    const isVoiceByMime = file.type.startsWith('audio/')
    const isImageByMime = file.type.startsWith('image/')

    let uploadFile = file
    if (isImageByMime || isImageByExtension) {
      try {
        uploadFile = await compressImageForUpload(file)
      } catch (err) {
        console.error('Image compression failed, uploading original file', err)
      }
    }

    const isVoice = isVoiceByMime || isVoiceByExtension
    const isImage = uploadFile.type.startsWith('image/') || isImageByExtension
    const maxSizeBytes = isVoice ? 10 * 1024 * 1024 : (isImage ? 50 * 1024 * 1024 : 25 * 1024 * 1024)

    if (uploadFile.size > maxSizeBytes) {
      alert(isVoice ? 'Voice file size must be less than 10MB' : (isImage ? 'Image file size must be less than 50MB' : 'File size must be less than 25MB'))
      return
    }

    setUploadingMedia(true)
    try {
      const uploadRes = await media.upload(uploadFile)
      const mediaId = uploadRes.data.media?.id

      let content = uploadFile.name
      if (isImage) {
        content = 'Shared an image'
      } else if (isVoice) {
        content = 'Voice message'
      }

      const res = await messages.send(conversationId, { content, media_id: mediaId })
      const newMessage = res.data.data
      appendMessageIfMissing(newMessage)
      const memberIds = res.data?.member_ids || (activeConv?.members || []).map(m => m.id)
      emitNewMessage(conversationId, newMessage, memberIds)
      requestConversationsRefresh(120)
    } catch (err) {
      console.error('Failed to upload file', err)
      const status = err.response?.status
      const msg = status === 413
        ? 'File is too large for server upload limit. Please choose a smaller file.'
        : (err.response?.data?.message || 'Failed to upload file. Please try again.')
      alert(msg)
    } finally {
      setUploadingMedia(false)
    }
  }

  const compressImageForUpload = async (file) => {
    const limitBytes = 18 * 1024 * 1024
    if (file.size <= limitBytes) return file

    const readAsDataUrl = (inputFile) => new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(inputFile)
    })

    const loadImage = (src) => new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = reject
      image.src = src
    })

    const src = await readAsDataUrl(file)
    const image = await loadImage(src)

    const maxDimension = 2560
    const scale = Math.min(1, maxDimension / Math.max(image.width, image.height))
    const targetWidth = Math.max(1, Math.round(image.width * scale))
    const targetHeight = Math.max(1, Math.round(image.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const context = canvas.getContext('2d')
    if (!context) return file

    context.drawImage(image, 0, 0, targetWidth, targetHeight)

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.82)
    })
    if (!blob) return file

    const baseName = file.name.replace(/\.[^/.]+$/, '')
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' })
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !conversationId) return
    
    // Reset file input so same file can be re-selected
    e.target.value = ''

    await uploadAndSendMedia(file)
  }

  const handleAudioCapture = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !conversationId) return
    e.target.value = ''
    await uploadAndSendMedia(file)
  }

  // Copy message to clipboard
  const copyMessage = (msg) => {
    navigator.clipboard.writeText(msg.content)
    setShowMessageMenu(null)
  }

  // Reply to message
  const handleReply = (msg) => {
    setReplyingTo(msg)
    setShowMessageMenu(null)
  }

  // Forward message
  const forwardMessage = async (msg) => {
    setForwardingMessage(msg)
    setForwardSearch('')
    setActiveActionMessageId(null)
    setShowMessageMenu(null)
  }

  const sendForwardedMessage = async (targetConvId) => {
    if (!forwardingMessage || forwardingTo) return

    const attachment = getAttachmentData(forwardingMessage)
    const trimmedContent = (forwardingMessage.content || '').trim()
    const previewText = trimmedContent
      ? trimmedContent
      : (attachment ? `[${attachment.type}] ${attachment.name || attachment.url}` : '')

    const forwardBody = previewText
      ? `Forwarded message:\n${previewText}`
      : 'Forwarded message'

    try {
      setForwardingTo(targetConvId)
      const res = await messages.send(targetConvId, { content: forwardBody })
      const newMessage = res.data?.data
      const targetConv = convList.find(c => String(c.id) === String(targetConvId))
      const memberIds = (targetConv?.members || []).map(m => m.id)
      if (newMessage) emitNewMessage(targetConvId, newMessage, memberIds)

      if (String(targetConvId) === String(conversationId) && newMessage) {
        appendMessageIfMissing(newMessage)
      }

      requestConversationsRefresh(120)
      setForwardingMessage(null)
      setForwardingTo(null)
    } catch (err) {
      console.error('Failed to forward message', err)
      alert(err.response?.data?.message || 'Failed to forward message')
      setForwardingTo(null)
    }
  }

  // Insert emoji into message input
  const insertEmoji = (emoji) => {
    setNewMsg(prev => prev + emoji)
    setShowInputEmoji(false)
  }

  // Handle voice recording (start/stop and send)
  const toggleRecording = () => {
    if (recording) {
      stopRecordingSession(true)
      return
    }

    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setActionToast({
        type: 'error',
        message: 'In-app voice recording is not supported on this browser/device.',
      })
      audioCaptureInputRef.current?.click()
      return
    }

    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((stream) => {
        recordingStreamRef.current = stream
        const preferredMimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
        const selectedMimeType = preferredMimeTypes.find((m) => window.MediaRecorder?.isTypeSupported?.(m))
        const recorder = selectedMimeType
          ? new MediaRecorder(stream, { mimeType: selectedMimeType })
          : new MediaRecorder(stream)

        recordingChunksRef.current = []
        recordingCancelledRef.current = false
        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) recordingChunksRef.current.push(event.data)
        }

        recorder.onstop = async () => {
          const shouldSend = !recordingCancelledRef.current
          if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
          setRecording(false)
          setRecordingSeconds(0)
          try {
            if (!shouldSend) return
            const recorderMime = (recorder.mimeType || '').toLowerCase()
            const safeMimeType = recorderMime.startsWith('video/webm')
              ? 'audio/webm'
              : (recorderMime || 'audio/webm')
            const ext = safeMimeType.includes('ogg') ? 'ogg' : safeMimeType.includes('mpeg') ? 'mp3' : 'webm'
            const blob = new Blob(recordingChunksRef.current, { type: safeMimeType })
            if (blob.size === 0) return
            const voiceFile = new File([blob], `voice-${Date.now()}.${ext}`, { type: safeMimeType })
            await uploadAndSendMedia(voiceFile)
          } finally {
            if (recordingStreamRef.current) {
              recordingStreamRef.current.getTracks().forEach((t) => t.stop())
              recordingStreamRef.current = null
            }
            recordingChunksRef.current = []
            mediaRecorderRef.current = null
            recordingCancelledRef.current = false
          }
        }

        recorder.onerror = () => {
          if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
          setRecording(false)
          setRecordingSeconds(0)
          setActionToast({ type: 'error', message: 'Voice recording failed. Please try again.' })
          if (recordingStreamRef.current) {
            recordingStreamRef.current.getTracks().forEach((t) => t.stop())
            recordingStreamRef.current = null
          }
          recordingChunksRef.current = []
          mediaRecorderRef.current = null
          recordingCancelledRef.current = false
        }

        mediaRecorderRef.current = recorder
        setRecordingSeconds(0)
        setRecording(true)
        recordingTimerRef.current = setInterval(() => {
          setRecordingSeconds(prev => prev + 1)
        }, 1000)
        recorder.start(250)
      })
      .catch((err) => {
        console.error('Voice recording start failed', err)

        const host = window.location.hostname
        const isTrustedLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1'
        const insecureHttp = window.location.protocol === 'http:' && !isTrustedLocal

        let message = 'Unable to access microphone. Please allow mic permission and try again.'

        if (insecureHttp || err?.name === 'SecurityError') {
          message = 'In-app recording requires HTTPS on Chrome for non-localhost sites. Open this app over HTTPS.'
        } else if (err?.name === 'NotAllowedError') {
          message = 'Microphone permission is blocked. Allow microphone access in Chrome site settings and retry.'
        } else if (err?.name === 'NotFoundError') {
          message = 'No microphone detected on this device.'
        }

        setActionToast({ type: 'error', message })

        // Keep compatibility fallback available.
        audioCaptureInputRef.current?.click()
      })
  }

  const searchUsers = async q => {
    setSearchQuery(q)
    if (q.length < 2) { setSearchResults([]); return }
    try {
      const res = await users.search(q)
      setSearchResults(res.data.users || [])
    } catch (err) {
      console.error('Search failed', err)
    }
  }

  const startConversation = async (targetUser) => {
    try {
      const res = await conversations.create({ type: 'private', user_ids: [targetUser.id] })
      setShowNewChat(false)
      setSearchQuery('')
      setSearchResults([])
      requestConversationsRefresh(120)
      navigate(`/c/${res.data.conversation.id}`)
    } catch (err) {
      console.error('Failed to create conversation', err)
    }
  }

  const createGroup = async () => {
    if (!groupName.trim() || selectedUsers.length < 2) return
    try {
      const res = await conversations.create({ 
        type: 'group', 
        name: groupName, 
        user_ids: selectedUsers.map(u => u.id) 
      })
      setShowGroupCreate(false)
      setGroupName('')
      setSelectedUsers([])
      setSearchQuery('')
      setSearchResults([])
      requestConversationsRefresh(120)
      navigate(`/c/${res.data.conversation.id}`)
    } catch (err) {
      console.error('Failed to create group', err)
    }
  }

  const toggleUserSelection = (u) => {
    if (selectedUsers.find(s => s.id === u.id)) {
      setSelectedUsers(selectedUsers.filter(s => s.id !== u.id))
    } else {
      setSelectedUsers([...selectedUsers, u])
    }
  }

  const getOtherUser = conv => {
    if (conv.type === 'group') {
      return { name: conv.name || 'Group', avatar_url: conv.icon_url, is_online: false }
    }
    const currentUserId = String(user.id)
    const otherMember = conv.members?.find(m => String(m.id) !== currentUserId)
    return otherMember || { name: conv.name || 'Chat', avatar_url: null }
  }

  const isConversationUserOnline = (conv) => {
    const other = getOtherUser(conv)
    return Boolean(isUserOnline(other.id))
  }

  const openProfilePreview = async (targetUserId, event) => {
    if (event) event.stopPropagation()
    if (!targetUserId) return

    setShowProfilePreview(true)
    setLoadingProfilePreview(true)
    setProfilePreview(null)

    try {
      const res = await users.get(targetUserId)
      setProfilePreview(res.data?.user || null)
    } catch (err) {
      console.error('Failed to load user profile preview', err)
      setProfilePreview(null)
    } finally {
      setLoadingProfilePreview(false)
    }
  }

  const navigateToPrivateUserProfile = (event) => {
    if (!activeConv || activeConv.type !== 'private') return
    event.stopPropagation()
    const otherId = getOtherUser(activeConv).id
    if (otherId) navigate(`/profile/${otherId}`)
  }

  const openConversationInfo = (event) => {
    if (event) event.stopPropagation()
    if (!activeConv) return

    if (activeConv.type === 'private') {
      const otherId = getOtherUser(activeConv).id
      if (otherId) {
        openProfilePreview(otherId)
        return
      }
    }

    setShowConvInfo(true)
  }

  const clearConversationHistory = async () => {
    if (!conversationId) return
    setShowConvActionsMenu(false)

    showStyledConfirm({
      title: 'Clear Chat History?',
      message: 'This will clear messages for everyone in this chat.',
      confirmLabel: 'Clear history',
      tone: 'danger',
      onConfirm: async () => {
        try {
          await conversations.clearHistory(conversationId)
          setMsgList([])
          requestConversationsRefresh(120)
          setActionToast({ type: 'success', message: 'Chat history cleared' })
        } catch (err) {
          console.error('Failed to clear conversation history', err)
          setActionToast({ type: 'error', message: 'Failed to clear chat history' })
        }
      },
    })
  }

  const deleteCurrentConversation = async () => {
    if (!conversationId) return
    setShowConvActionsMenu(false)

    showStyledConfirm({
      title: 'Delete Chat?',
      message: 'This removes the chat only from your account.',
      confirmLabel: 'Delete chat',
      tone: 'danger',
      onConfirm: async () => {
        try {
          await conversations.delete(conversationId)
          setMsgList([])
          setActiveConv(null)
          requestConversationsRefresh(120)
          navigate('/c')
          setActionToast({ type: 'success', message: 'Chat deleted for your account' })
        } catch (err) {
          console.error('Failed to delete conversation', err)
          setActionToast({ type: 'error', message: 'Failed to delete chat for your account' })
        }
      },
    })
  }

  const blockConversationUser = async () => {
    if (!activeConv || activeConv.type !== 'private') return
    setShowConvActionsMenu(false)

    const other = getOtherUser(activeConv)
    if (!other?.id) return

    showStyledConfirm({
      title: `Block ${other.name || 'User'}?`,
      message: 'You can unblock them later from chat actions.',
      confirmLabel: 'Block user',
      tone: 'danger',
      onConfirm: async () => {
        try {
          await users.block(other.id)
          setBlockedUserIds(prev => new Set([...prev, other.id]))
          setActiveConv(prev => prev ? { ...prev, private_chat_blocked: true } : prev)
          requestConversationsRefresh(120)
          setActionToast({ type: 'success', message: 'User blocked' })
        } catch (err) {
          console.error('Failed to block user', err)
          setActionToast({ type: 'error', message: 'Failed to block user' })
        }
      },
    })
  }

  const unblockConversationUser = async () => {
    if (!activeConv || activeConv.type !== 'private') return
    setShowConvActionsMenu(false)

    const other = getOtherUser(activeConv)
    if (!other?.id) return

    showStyledConfirm({
      title: `Unblock ${other.name || 'User'}?`,
      message: 'They will be able to message you again.',
      confirmLabel: 'Unblock user',
      tone: 'neutral',
      onConfirm: async () => {
        try {
          await users.unblock(other.id)
          setBlockedUserIds(prev => {
            const next = new Set(prev)
            next.delete(other.id)
            return next
          })
          setActiveConv(prev => prev ? { ...prev, private_chat_blocked: false } : prev)
          setActionToast({ type: 'success', message: 'User unblocked' })
        } catch (err) {
          console.error('Failed to unblock user', err)
          setActionToast({ type: 'error', message: 'Failed to unblock user' })
        }
      },
    })
  }

  const isActivePrivateUserBlocked = () => {
    if (!activeConv || activeConv.type !== 'private') return false
    const other = getOtherUser(activeConv)
    return Boolean(other?.id && blockedUserIds.has(other.id))
  }

  const isActivePrivateChatBlocked = () => {
    if (!activeConv || activeConv.type !== 'private') return false
    return Boolean(activeConv.private_chat_blocked || isActivePrivateUserBlocked())
  }

  const copyProfileLink = async () => {
    if (!profilePreview?.id) return
    const url = `${window.location.origin}/profile/${profilePreview.id}`
    try {
      await navigator.clipboard.writeText(url)
      alert('Profile link copied')
    } catch {
      alert('Failed to copy profile link')
    }
  }

  const formatTime = date => {
    if (!date) return ''
    const d = new Date(date)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const formatDate = date => {
    if (!date) return ''
    const d = new Date(date)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    
    if (d.toDateString() === today.toDateString()) return 'Today'
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
    return d.toLocaleDateString()
  }

  const formatDuration = totalSeconds => {
    // Handle NaN, Infinity, null, undefined, and negative values
    if (!isFinite(totalSeconds) || totalSeconds == null || totalSeconds < 0) {
      return '00:00'
    }
    const safeSeconds = Math.floor(totalSeconds)
    const minutes = String(Math.floor(safeSeconds / 60)).padStart(2, '0')
    const seconds = String(safeSeconds % 60).padStart(2, '0')
    return `${minutes}:${seconds}`
  }

  const getAttachmentData = (msg) => {
    const attachment = msg.attachments?.[0]
    if (attachment) {
      return {
        id: attachment.id,
        type: attachment.type,
        url: resolveMediaUrl(attachment.file_path),
        name: attachment.original_filename,
        mimeType: attachment.mime_type,
      }
    }

    const imageMatch = msg.content.match(/\[Image: (.*?)\]/)
    if (imageMatch) return { type: 'image', url: resolveMediaUrl(imageMatch[1]), name: 'Shared image' }

    const voiceMatch = msg.content.match(/\[Voice: (.*?)\]/)
    if (voiceMatch) return { type: 'voice', url: resolveMediaUrl(voiceMatch[1]), name: 'Voice message' }

    const fileMatch = msg.content.match(/\[File: (.*?)\]\((.*?)\)/)
    if (fileMatch) return { type: 'file', url: resolveMediaUrl(fileMatch[2]), name: fileMatch[1] }

    return null
  }

  const downloadAttachment = async (msg, attachment) => {
    if (!attachment) return

    const fallbackName = attachment.name || `${attachment.type || 'file'}-${msg.id}`
    const triggerDownload = async (blobOrUrl, filename) => {
      const link = document.createElement('a')
      link.style.display = 'none'
      if (blobOrUrl instanceof Blob) {
        const mimeType = blobOrUrl.type || attachment.mimeType || 'application/octet-stream'
        const isMobileBrowser = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

        if (typeof File !== 'undefined' && navigator.share && navigator.canShare) {
          try {
            const file = new File([blobOrUrl], filename, { type: mimeType })
            if (navigator.canShare({ files: [file] })) {
              await navigator.share({
                files: [file],
                title: filename,
              })
              return
            }
          } catch (shareErr) {
            if (shareErr?.name === 'AbortError') {
              return
            }
          }
        }

        const blobUrl = URL.createObjectURL(blobOrUrl)

        if (isMobileBrowser) {
          const opened = window.open(blobUrl, '_blank', 'noopener,noreferrer')
          if (!opened) {
            window.location.href = blobUrl
          }
          setTimeout(() => URL.revokeObjectURL(blobUrl), 60000)
          return
        }

        link.href = blobUrl
        link.download = filename
        document.body.appendChild(link)
        link.click()
        link.remove()
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
        return
      }

      link.href = blobOrUrl
      link.download = filename
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      document.body.appendChild(link)
      link.click()
      link.remove()
    }

    try {
      if (attachment.id) {
        const response = await media.download(attachment.id)
        const contentDisposition = response.headers?.['content-disposition'] || ''
        const matchedFilename = contentDisposition.match(/filename\*?=(?:UTF-8''|\")?([^";]+)/i)
        const decodedName = matchedFilename
          ? decodeURIComponent(matchedFilename[1].replace(/"/g, '').trim())
          : fallbackName
        await triggerDownload(response.data, decodedName)
        return
      }

      if (attachment.url) {
        await triggerDownload(attachment.url, fallbackName)
      }
    } catch (err) {
      console.error('Failed to download attachment', err)
      alert('Failed to download file. Please try again.')
    }
  }

  const isMediaOnlyMessage = (msg) => Boolean(getAttachmentData(msg))

  const setAudioRef = (messageId, element) => {
    if (!element) {
      delete audioRefs.current[messageId]
      return
    }
    audioRefs.current[messageId] = element
  }

  const toggleVoicePlayback = async (messageId) => {
    const audio = audioRefs.current[messageId]
    if (!audio) return

    if (playingVoiceId && playingVoiceId !== messageId) {
      audioRefs.current[playingVoiceId]?.pause?.()
    }

    if (!audio.paused) {
      audio.pause()
      setPlayingVoiceId(null)
      return
    }

    try {
      await audio.play()
      setPlayingVoiceId(messageId)
    } catch (err) {
      console.error('Failed to play voice message', err)
    }
  }

  const seekVoiceMessage = (messageId, event) => {
    const audio = audioRefs.current[messageId]
    if (!audio || !audio.duration) return

    const bounds = event.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
    audio.currentTime = audio.duration * ratio
    setVoiceProgress(prev => ({ ...prev, [messageId]: ratio }))
  }

  const stopRecordingSession = (shouldSend) => {
    recordingCancelledRef.current = !shouldSend
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
      return
    }

    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
    setRecording(false)
    setRecordingSeconds(0)
    if (recordingStreamRef.current) {
      recordingStreamRef.current.getTracks().forEach(track => track.stop())
      recordingStreamRef.current = null
    }
    recordingChunksRef.current = []
    mediaRecorderRef.current = null
    recordingCancelledRef.current = false
  }

  const renderVoiceBubble = (msg, attachment) => {
    const progress = voiceProgress[msg.id] || 0
    const duration = voiceDuration[msg.id] || 0
    const bars = [10, 16, 22, 14, 20, 12, 24, 15, 19, 11, 21, 13, 18, 12]
    const activeBars = Math.max(1, Math.round(progress * bars.length))
    const isPlaying = playingVoiceId === msg.id
    
    // Calculate display time - show current position if playing, otherwise show total duration
    const displayTime = isFinite(duration) && duration > 0
      ? (isPlaying && progress > 0 ? (progress * duration) : duration)
      : 0

    return (
      <div className="min-w-0 max-w-full rounded-2xl border border-white/10 bg-white/6 px-2 sm:px-3 py-2 sm:py-2.5">
        <audio
          ref={(element) => setAudioRef(msg.id, element)}
          src={attachment.url}
          preload="metadata"
          className="hidden"
          onLoadedMetadata={(event) => {
            const nextDuration = event.currentTarget.duration
            if (isFinite(nextDuration) && nextDuration > 0) {
              setVoiceDuration(prev => ({ ...prev, [msg.id]: nextDuration }))
            }
          }}
          onDurationChange={(event) => {
            // Fallback for when loadedmetadata doesn't fire
            const nextDuration = event.currentTarget.duration
            if (isFinite(nextDuration) && nextDuration > 0) {
              setVoiceDuration(prev => ({ ...prev, [msg.id]: nextDuration }))
            }
          }}
          onCanPlay={(event) => {
            // Additional fallback - fires when audio is ready to play
            const nextDuration = event.currentTarget.duration
            if (isFinite(nextDuration) && nextDuration > 0 && !voiceDuration[msg.id]) {
              setVoiceDuration(prev => ({ ...prev, [msg.id]: nextDuration }))
            }
          }}
          onTimeUpdate={(event) => {
            const { currentTime, duration: totalDuration } = event.currentTarget
            const nextProgress = (isFinite(totalDuration) && totalDuration > 0) ? currentTime / totalDuration : 0
            setVoiceProgress(prev => ({ ...prev, [msg.id]: nextProgress }))
          }}
          onEnded={() => {
            setPlayingVoiceId(current => current === msg.id ? null : current)
            setVoiceProgress(prev => ({ ...prev, [msg.id]: 0 }))
          }}
        />
        <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
          <button
            type="button"
            onClick={() => toggleVoicePlayback(msg.id)}
            className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full bg-white text-black transition hover:scale-[1.03]"
          >
            {isPlaying ? <Pause size={16} className="sm:w-[18px] sm:h-[18px]" /> : <Play size={16} className="sm:w-[18px] sm:h-[18px] ml-0.5" />}
          </button>
          <button
            type="button"
            onClick={(event) => seekVoiceMessage(msg.id, event)}
            className="flex flex-1 items-end gap-[2px] sm:gap-[3px] rounded-xl px-0.5 sm:px-1 py-1 min-w-0 max-w-[100px] sm:max-w-[140px]"
            aria-label="Seek voice message"
          >
            {bars.map((height, index) => (
              <span
                key={`${msg.id}-bar-${index}`}
                className={`w-[2px] sm:w-[3px] rounded-full transition-all shrink-0 ${index < activeBars ? 'bg-white' : 'bg-white/25'}`}
                style={{ height }}
              />
            ))}
          </button>
          <div className="shrink-0 text-[10px] sm:text-[11px] font-medium text-white/75 tabular-nums min-w-[38px] sm:min-w-[42px] text-right">
            {formatDuration(displayTime)}
          </div>
        </div>
        {activeConv?.type === 'private' && (
          <div className="mt-1.5 sm:mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => downloadAttachment(msg, attachment)}
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[10px] sm:text-[11px] text-white/80 hover:bg-white/10"
            >
              <Download size={11} className="sm:w-3 sm:h-3" /> Download
            </button>
          </div>
        )}
      </div>
    )
  }

  const getMessageStatus = (msg) => {
    if (msg.user_id !== user.id) return null
    if (msg.status === 'seen') return <CheckCheck size={14} className="text-blue-400" />
    if (msg.status === 'delivered') return <CheckCheck size={14} className="text-gray-400" />
    return <Check size={14} className="text-gray-500" />
  }

  const canEdit = (msg) => {
    return msg.user_id === user.id && !msg.deleted
  }

  const canDelete = (msg) => {
    return msg.user_id === user.id && !msg.deleted
  }

  const filteredForwardConversations = convList.filter((conv) => {
    const query = forwardSearch.trim().toLowerCase()
    if (!query) return true
    return getOtherUser(conv).name?.toLowerCase().includes(query)
  })

  const startMessageLongPress = (msgId) => {
    longPressTriggeredRef.current = false
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true
      setActiveActionMessageId(msgId)
      setShowMessageMenu(msgId)
      setShowEmojiPicker(null)
    }, 500)
  }

  const endMessageLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  const renderMessageContent = (msg) => {
    if (msg.deleted) return <span className="italic text-gray-500">[Message deleted]</span>

    const attachment = getAttachmentData(msg)
    const normalizedContent = String(msg.content || '').trim()
    const isSharedStory = isSharedStoryMessage(msg)
    const isSharedPost = isSharedPostMessage(msg)

    if (!msg.story_id && normalizedContent === SHARED_STORY_MESSAGE) {
      return <span className="italic text-gray-500">Story no longer available</span>
    }

    if (!msg.post_id && normalizedContent === SHARED_POST_MESSAGE) {
      return <span className="italic text-gray-500">Post no longer available</span>
    }

    // Story reply — show story thumbnail with reply text (Instagram-style)
    if (msg.story_id) {
      const mediaUrl = stories.getMediaUrl(msg.story_id)
      return (
        <div>
          <button
            type="button"
            onClick={() => navigate(`/story/${msg.story_id}`)}
            className="mb-2 w-full text-left rounded-lg overflow-hidden border border-gray-700 bg-gray-800/60"
          >
            <div className="px-2 py-1 text-[10px] text-gray-400 bg-gray-800">
              {isSharedStory
                ? 'Shared story'
                : `Replied to ${msg.user_id === user.id ? `${msg.story_owner}'s` : 'your'} story`}
            </div>
            {msg.story_unavailable || msg.story_expired ? (
              <div className="px-3 py-4 text-xs text-gray-500 italic text-center">Story no longer available</div>
            ) : mediaUrl ? (
              msg.story_media_type === 'video' ? (
                <video src={mediaUrl} className="w-full max-h-32 object-cover" muted />
              ) : (
                <>
                  <img
                    src={mediaUrl}
                    alt="Story"
                    className="w-full max-h-32 object-cover"
                    style={{ display: 'block' }}
                    onError={e => {
                      e.target.style.display = 'none';
                      const fallback = document.createElement('div');
                      fallback.className = 'px-3 py-4 text-xs text-gray-500 italic text-center w-full max-h-32 flex items-center justify-center bg-gray-900 border border-gray-700';
                      fallback.innerText = 'Story unavailable';
                      e.target.parentNode.appendChild(fallback);
                    }}
                  />
                </>
              )
            ) : (
              <div className="px-3 py-4 text-xs text-gray-500 italic text-center">Story unavailable</div>
            )}
            {isSharedStory && msg.story_caption ? (
              <div className="px-3 py-2 text-xs text-gray-300 whitespace-pre-wrap border-t border-gray-700/70">
                {msg.story_caption}
              </div>
            ) : null}
          </button>
          {!isSharedStory && <span>{msg.content}</span>}
        </div>
      )
    }

    if (msg.post_id) {
      const mediaUrls = getPostMediaUrls({ media_urls: msg.post_media_urls, image_url: msg.post_image_url })
      const previewImage = mediaUrls[0]

      return (
        <div>
          <button
            type="button"
            onClick={() => navigate(`/post/${msg.post_id}`)}
            className="mb-2 w-full text-left rounded-lg overflow-hidden border border-gray-700 bg-gray-800/60"
          >
            <div className="px-2 py-1 text-[10px] text-gray-400 bg-gray-800">
              Shared post
            </div>
            {msg.post_unavailable ? (
              <div className="px-3 py-4 text-xs text-gray-500 italic text-center">Post no longer available</div>
            ) : (
              <>
                {previewImage ? (
                  <img src={previewImage} alt="Post" className="w-full max-h-40 object-cover" />
                ) : null}
                <div className="px-3 py-2">
                  {msg.post_owner_username ? (
                    <div className="text-xs text-cyan-300 mb-1">@{msg.post_owner_username}</div>
                  ) : null}
                  {msg.post_caption ? (
                    <div className="text-sm text-gray-200 whitespace-pre-wrap line-clamp-4">{msg.post_caption}</div>
                  ) : (
                    <div className="text-xs text-gray-500 italic">Open post</div>
                  )}
                </div>
              </>
            )}
          </button>
          {!isSharedPost && <span>{msg.content}</span>}
        </div>
      )
    }

    // Legacy story reply format (old messages before story_id was added)
    const storyReplyMatch = msg.content.match(/^\[Story reply to @(.*?)\]\n---\n(.*)$/s)
    if (storyReplyMatch) {
      const [, storyOwner, replyText] = storyReplyMatch
      return (
        <div>
          <div className="mb-2 px-2 py-1 bg-gray-800/50 rounded-lg border-l-2 border-purple-500">
            <span className="text-[10px] text-gray-400 block">Replied to @{storyOwner}'s story</span>
          </div>
          <span>{replyText}</span>
        </div>
      )
    }
    
    // Check for reply format: [Reply to: name] original message\n---\nactual message
    const replyMatch = msg.content.match(/^\[Reply to: (.*?)\] (.*?)\n---\n(.*)$/s)
    if (replyMatch) {
      const [, replyToName, originalMsg, actualMsg] = replyMatch
      return (
        <div>
          <div className="mb-2 px-2 py-1 bg-gray-800/50 rounded-lg border-l-2 border-gray-500">
            <span className="text-xs text-gray-400 block">{replyToName}</span>
            <span className="text-xs text-gray-500 truncate block">{originalMsg}</span>
          </div>
          <span>{actualMsg}</span>
        </div>
      )
    }

    if (attachment?.type === 'image') {
      return (
        <div className="rounded-2xl border border-white/10 bg-white/6 p-2">
          <button
            type="button"
            onClick={() => window.open(attachment.url, '_blank')}
            className="block overflow-hidden rounded-2xl"
          >
            <img
              src={attachment.url}
              alt={attachment.name || 'Shared image'}
              className="max-h-88 w-full max-w-sm rounded-2xl object-cover transition hover:opacity-95"
            />
          </button>
          {activeConv?.type === 'private' && (
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={() => downloadAttachment(msg, attachment)}
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[11px] text-white/80 hover:bg-white/10"
              >
                <Download size={12} /> Download
              </button>
            </div>
          )}
        </div>
      )
    }

    if (attachment?.type === 'voice') {
      return renderVoiceBubble(msg, attachment)
    }

    if (attachment?.type === 'file') {
      return (
        <div className="rounded-2xl border border-white/10 bg-white/6 px-3 py-2">
          <button
            type="button"
            onClick={() => window.open(attachment.url, '_blank')}
            className="flex w-full items-center gap-2 text-left text-blue-300 transition hover:opacity-90"
          >
            <Paperclip size={16} />
            <span className="truncate">{attachment.name}</span>
          </button>
          {activeConv?.type === 'private' && (
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={() => downloadAttachment(msg, attachment)}
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[11px] text-white/80 hover:bg-white/10"
              >
                <Download size={12} /> Download
              </button>
            </div>
          )}
        </div>
      )
    }
    
    return msg.content
  }

  const getMessageSearchText = (msg) => {
    const attachment = getAttachmentData(msg)
    const parts = [
      msg?.content || '',
      msg?.user?.name || '',
      msg?.user?.username || '',
      attachment?.name || '',
      attachment?.type || '',
    ]
    return parts.join(' ').toLowerCase()
  }

  const typingUsers = getTypingUsers(conversationId)
  const messageSearchQuery = globalSearch.trim().toLowerCase()
  const filteredMessages = messageSearchQuery
    ? msgList.filter((msg) => getMessageSearchText(msg).includes(messageSearchQuery))
    : msgList

  if (loading) {
    return (
      <div className="h-[100dvh] md:h-[calc(100dvh-4rem)] flex bg-black">
        <div className="w-full md:w-80 lg:w-96 border-r border-gray-800 flex-col bg-black flex">
          <div className="h-12 sm:h-14 px-3 sm:px-4 flex items-center justify-between border-b border-gray-800 shrink-0">
            <Skeleton width="w-32" height="h-5" />
            <Skeleton className="w-5 h-5 rounded" />
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex items-center gap-3 p-3 mb-2">
                <Skeleton className="w-12 h-12 rounded-full shrink-0" />
                <div className="flex-1">
                  <Skeleton width="w-32" height="h-4" className="mb-2" />
                  <Skeleton width="w-48" height="h-3" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 md:static md:h-[calc(100dvh-4rem)] flex bg-black overflow-hidden">
      {/* Sidebar - hidden on mobile when conversation is selected */}
      <div className={`${conversationId ? 'hidden md:flex' : 'flex'} w-full md:w-80 lg:w-96 border-r border-gray-800 flex-col bg-black`}>
        {/* Header */}
        <div className="h-12 sm:h-14 px-3 sm:px-4 flex items-center justify-between border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-1 cursor-pointer hover:opacity-70 min-w-0" onClick={() => navigate('/profile')}>
            <span className="font-semibold text-sm sm:text-base truncate text-white">{user.name}</span>
            <ChevronDown size={16} className="text-gray-400 shrink-0" />
          </div>
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <button onClick={() => setShowNewChat(true)} className="hover:opacity-60 p-1 text-gray-400">
              <PenSquare size={18} className="sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        <div className="px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between border-b border-gray-800 shrink-0">
          <span className="font-semibold text-xs sm:text-sm text-white">Messages</span>
          <button 
            onClick={() => setShowGroupCreate(true)}
            className="text-white hover:opacity-70"
          >
            <Users size={18} />
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {convList.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              <p className="text-sm">No messages yet</p>
              <button onClick={() => setShowNewChat(true)} className="text-white font-semibold mt-2 text-sm hover:text-gray-300">
                Start a conversation
              </button>
            </div>
          ) : (
            convList.map(conv => {
              const other = getOtherUser(conv)
              const isActive = conversationId === String(conv.id)
              const online = conv.type === 'private' && isConversationUserOnline(conv)
              const convTypingUsers = getTypingUsers(conv.id)
              const isTypingInConv = convTypingUsers.length > 0
              return (
                <div
                  key={conv.id}
                  onClick={() => navigate(`/c/${conv.id}`)}
                  className={`flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-gray-900 transition ${isActive ? 'bg-gray-900 border-l-2 border-white' : ''}`}
                >
                  <div className="relative shrink-0">
                    {conv.type === 'private' ? (
                      <button
                        type="button"
                        onClick={(event) => openProfilePreview(other.id, event)}
                        onTouchStart={(event) => openProfilePreview(other.id, event)}
                        onContextMenu={(event) => {
                          event.preventDefault()
                          openProfilePreview(other.id, event)
                        }}
                        className={`rounded-full p-0.5 ${hasUnviewedStory(other.id) ? 'bg-linear-to-tr from-blue-400 via-cyan-500 to-blue-600' : 'bg-transparent'}`}
                      >
                        <img src={getAvatarUrl(other)} className="w-12 h-12 rounded-full object-cover border-2 border-black shrink-0" alt="" style={{ aspectRatio: '1 / 1' }} />
                      </button>
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-linear-to-br from-blue-500 to-cyan-600 flex items-center justify-center text-white font-semibold text-sm">
                        {conv.type === 'group' ? <Users size={20} /> : other.name?.[0]?.toUpperCase() || '?'}
                      </div>
                    )}
                    {online && <div className="online-dot"></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate text-white">{other.name}</p>
                    <p className={`text-xs truncate ${isTypingInConv ? 'text-green-400' : 'text-gray-500'}`}>
                      {isTypingInConv ? 'Typing...' : (getConversationPreviewText(conv.last_message)?.substring(0, 30) || 'Start chatting')}
                    </p>
                  </div>
                  {conv.unread_count > 0 && (
                    <div className="bg-white text-black text-xs rounded-full w-5 h-5 flex items-center justify-center font-semibold">
                      {conv.unread_count}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Chat area - hidden on mobile when no conversation */}
      <div className={`${!conversationId ? 'hidden md:flex' : 'flex'} flex-1 flex-col bg-black min-w-0 h-full max-h-full overflow-hidden relative`}>
        {conversationId && activeConv ? (
          <div className="flex flex-col h-full overflow-hidden">
            {/* Chat header - STICKY at top */}
            <div className="sticky top-0 h-12 sm:h-14 px-2 sm:px-3 md:px-4 flex items-center justify-between border-b border-gray-800 bg-black shrink-0 z-20">
              {/* Back button - mobile only */}
              <button 
                onClick={() => navigate('/chat')}
                className="md:hidden mr-1 sm:mr-2 p-1 hover:bg-gray-800 rounded-full shrink-0"
              >
                <ArrowLeft size={20} className="text-white" />
              </button>
              <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3 cursor-pointer hover:opacity-70 flex-1 min-w-0 overflow-hidden" onClick={openConversationInfo}>
                <div className="relative shrink-0">
                  {activeConv.type === 'private' ? (
                    <button
                      type="button"
                      onClick={(event) => openProfilePreview(getOtherUser(activeConv).id, event)}
                      onTouchStart={(event) => openProfilePreview(getOtherUser(activeConv).id, event)}
                      onContextMenu={(event) => {
                        event.preventDefault()
                        openProfilePreview(getOtherUser(activeConv).id, event)
                      }}
                      className={`rounded-full p-0.5 ${hasUnviewedStory(getOtherUser(activeConv).id) ? 'bg-linear-to-tr from-blue-400 via-cyan-500 to-blue-600' : 'bg-transparent'}`}
                    >
                      <img src={getAvatarUrl(getOtherUser(activeConv))} className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover border-2 border-black shrink-0" alt="" style={{ aspectRatio: '1 / 1' }} />
                    </button>
                  ) : (
                    <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-linear-to-br from-blue-500 to-cyan-600 flex items-center justify-center text-white text-xs font-semibold shrink-0">
                      <Users size={14} className="sm:w-4 sm:h-4" />
                    </div>
                  )}
                  {activeConv.type === 'private' && isConversationUserOnline(activeConv) && (
                    <div className="online-dot"></div>
                  )}
                </div>
                <div className="min-w-0 flex-1 overflow-hidden">
                  {activeConv.type === 'private' ? (
                    <button
                      type="button"
                      onClick={navigateToPrivateUserProfile}
                      className="font-semibold text-xs sm:text-sm text-white hover:underline truncate block w-full text-left"
                    >
                      {getOtherUser(activeConv).name}
                    </button>
                  ) : (
                    <span className="font-semibold text-xs sm:text-sm text-white truncate block">{getOtherUser(activeConv).name}</span>
                  )}
                  <p className="text-[10px] sm:text-xs text-gray-500 truncate">
                    {typingUsers.length > 0 
                      ? 'Typing...'
                      : (activeConv.type === 'private' || (activeConv.members?.length || 0) <= 2)
                        ? (isConversationUserOnline(activeConv) ? 'Active now' : 'Offline')
                        : `${activeConv.members?.length || 0} members`
                    }
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 relative">
                {activeConv.type === 'private' && (
                  <button
                    type="button"
                    onClick={() => setShowSearch((prev) => !prev)}
                    className={`cursor-pointer hover:opacity-60 ${showSearch ? 'text-white' : 'text-gray-500'}`}
                    aria-label="Search in chat"
                  >
                    <Search size={22} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={openConversationInfo}
                  className="cursor-pointer hover:opacity-60 text-gray-500"
                  aria-label="Details"
                >
                  <Info size={24} />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    setShowConvActionsMenu(prev => !prev)
                  }}
                  className="cursor-pointer hover:opacity-60 text-gray-500"
                  aria-label="Chat actions"
                >
                  <MoreVertical size={22} />
                </button>
                {showConvActionsMenu && (
                  <div className="absolute right-0 top-10 w-48 bg-gray-900 border border-gray-800 rounded-xl shadow-lg z-50 overflow-hidden">
                    <button
                      type="button"
                      onClick={clearConversationHistory}
                      className="w-full text-left px-4 py-3 text-sm text-white hover:bg-gray-800"
                    >
                      Clear history
                    </button>
                    <button
                      type="button"
                      onClick={deleteCurrentConversation}
                      className="w-full text-left px-4 py-3 text-sm text-white hover:bg-gray-800"
                    >
                      Delete chat (only me)
                    </button>
                    {activeConv.type === 'private' && (
                      <button
                        type="button"
                        onClick={isActivePrivateUserBlocked() ? unblockConversationUser : blockConversationUser}
                        className={`w-full text-left px-4 py-3 text-sm hover:bg-gray-800 ${isActivePrivateUserBlocked() ? 'text-yellow-300' : 'text-red-300'}`}
                      >
                        {isActivePrivateUserBlocked() ? 'Unblock user' : 'Block user'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {activeConv.type === 'private' && showSearch && (
              <div className="sticky top-12 sm:top-14 px-4 py-2 border-b border-gray-800 bg-black shrink-0 z-10">
                <input
                  type="text"
                  placeholder="Search in this chat..."
                  value={globalSearch}
                  onChange={(e) => setGlobalSearch(e.target.value)}
                  className="w-full bg-gray-900 rounded-lg px-3 py-2 text-sm outline-none text-white placeholder-gray-500 border border-gray-800"
                />
              </div>
            )}

            {/* Messages - scrollable area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1 bg-black min-h-0">
              {showConvActionsMenu && (
                <div className="fixed inset-0 z-40" onClick={() => setShowConvActionsMenu(false)} />
              )}
              {activeActionMessageId && (
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => {
                    setActiveActionMessageId(null)
                    setShowEmojiPicker(null)
                    setShowMessageMenu(null)
                  }}
                />
              )}
              {filteredMessages.map((msg, idx) => {
                const isMine = String(msg.user_id) === String(user.id)
                const reactions = msg.reactions || []
                const reactionCounts = Object.entries(reactions.reduce((acc, r) => {
                  acc[r.emoji] = (acc[r.emoji] || 0) + 1
                  return acc
                }, {}))
                const showDate = idx === 0 || formatDate(msg.created_at) !== formatDate(filteredMessages[idx - 1]?.created_at)

                return (
                  <div key={msg.id || idx}>
                    {showDate && (
                      <div className="text-center text-xs text-gray-500 py-4">
                        {formatDate(msg.created_at)}
                      </div>
                    )}
                    <div
                      className={`flex gap-2 mb-4 ${isMine ? 'justify-end' : 'justify-start'} group`}
                      onMouseEnter={() => setHoveredMessageId(msg.id)}
                      onMouseLeave={() => setHoveredMessageId(null)}
                      onTouchStart={() => startMessageLongPress(msg.id)}
                      onTouchEnd={endMessageLongPress}
                      onTouchCancel={endMessageLongPress}
                      onTouchMove={endMessageLongPress}
                      onContextMenu={(e) => {
                        if (isMine) e.preventDefault()
                      }}
                    >
                      {!isMine && activeConv.type === 'group' && (
                        <button
                          type="button"
                          onClick={(event) => openProfilePreview(msg.user?.id, event)}
                          onTouchStart={(event) => openProfilePreview(msg.user?.id, event)}
                          onContextMenu={(event) => {
                            event.preventDefault()
                            openProfilePreview(msg.user?.id, event)
                          }}
                          className="w-7 h-7 rounded-full bg-linear-to-br from-blue-500 to-cyan-600 flex items-center justify-center text-white text-xs font-semibold shrink-0"
                        >
                          {msg.user?.name?.[0]?.toUpperCase() || '?'}
                        </button>
                      )}

                      <div className={`flex flex-col max-w-[85%] sm:max-w-[80%] md:max-w-[75%] ${isMine ? 'items-end' : 'items-start'} min-w-0`}>
                        {!isMine && activeConv.type === 'group' && (
                          <span className="text-xs text-ig-gray-500 mb-1">{msg.user?.name}</span>
                        )}

                        {editingMessage === msg.id ? (
                          <div className="flex gap-2 items-center">
                            <input
                              type="text"
                              value={editContent}
                              onChange={e => setEditContent(e.target.value)}
                              className="input-ig text-sm"
                              autoFocus
                            />
                            <button onClick={() => editMessage(msg.id)} className="text-ig-blue text-sm font-semibold">Save</button>
                            <button onClick={() => { setEditingMessage(null); setEditContent('') }} className="text-ig-gray-500 text-sm">Cancel</button>
                          </div>
                        ) : (
                          <div className={`relative ${isMine ? 'message-sent' : 'message-received'} ${isMediaOnlyMessage(msg) ? 'px-2 py-2' : ''}`}>
                            <div className="text-sm">{renderMessageContent(msg)}</div>
                            <div className={`flex items-center gap-1 mt-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
                              <span className={`text-xs ${isMine ? 'text-gray-300' : 'text-gray-400'}`}>
                                {formatTime(msg.created_at)}
                              </span>
                              {msg.edited_at && <span className="text-xs text-gray-400">(edited)</span>}
                              {getMessageStatus(msg)}
                            </div>
                          </div>
                        )}

                        {/* Reactions display */}
                        {reactionCounts.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {reactionCounts.map(([emoji, count]) => {
                              const myReaction = reactions.find(
                                r => String(r.emoji) === String(emoji) && String(r.user_id) === String(user.id)
                              )
                              return (
                                <button
                                  key={emoji}
                                  onClick={() => myReaction ? removeReaction(msg.id, emoji) : addReaction(msg.id, emoji)}
                                  className={`px-2 py-0.5 rounded-full text-xs flex items-center gap-0.5 transition ${myReaction ? 'bg-white/20 border border-white' : 'bg-gray-800 hover:bg-gray-700'}`}
                                >
                                  {emoji} <span className="text-gray-300">{count}</span>
                                </button>
                              )
                            })}
                          </div>
                        )}

                      </div>

                      {/* Message actions menu (Reply, React, Copy, Forward) */}
                      <div className={`${hoveredMessageId === msg.id || showEmojiPicker === msg.id || showMessageMenu === msg.id || activeActionMessageId === msg.id ? 'opacity-100' : 'opacity-0 sm:opacity-0'} flex items-center gap-0.5 sm:gap-1 shrink-0 relative ${isMine ? 'order-first mr-0.5 sm:mr-1' : 'ml-0.5 sm:ml-1'}`}
                        style={{ zIndex: showEmojiPicker === msg.id || showMessageMenu === msg.id ? 45 : 40 }}
                      >
                        <button
                          onClick={() => {
                            setActiveActionMessageId(msg.id)
                            setShowEmojiPicker(showEmojiPicker === msg.id ? null : msg.id)
                          }}
                          className="text-gray-500 hover:text-gray-300 p-1"
                        >
                          <Smile size={16} />
                        </button>

                        <div className="relative">
                          <button
                            onClick={() => {
                              setActiveActionMessageId(msg.id)
                              setShowMessageMenu(showMessageMenu === msg.id ? null : msg.id)
                            }}
                            className="text-gray-500 hover:text-gray-300 p-1"
                          >
                            <MoreVertical size={16} />
                          </button>
                          {showMessageMenu === msg.id && (
                            <div className={`fixed sm:absolute top-auto sm:top-full mt-1 ${isMine ? 'right-2 sm:right-0' : 'left-2 sm:left-0'} bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-1 z-50 min-w-[140px] max-w-[200px]`}
                              style={{
                                bottom: window.innerWidth < 640 ? 'auto' : undefined,
                                top: window.innerWidth < 640 ? '50%' : undefined,
                                transform: window.innerWidth < 640 ? 'translateY(-50%)' : undefined
                              }}
                            >
                              {/* Reply */}
                              <button
                                onClick={() => { handleReply(msg); setShowMessageMenu(null); setActiveActionMessageId(null) }}
                                className="flex items-center gap-2 px-3 py-2 hover:bg-gray-800 w-full text-left text-sm text-white"
                              >
                                <Reply size={14} /> Reply
                              </button>
                              {/* Copy */}
                              <button
                                onClick={() => { copyMessage(msg); setShowMessageMenu(null); setActiveActionMessageId(null) }}
                                className="flex items-center gap-2 px-3 py-2 hover:bg-gray-800 w-full text-left text-sm text-white"
                              >
                                <Copy size={14} /> Copy
                              </button>
                              {/* Edit (only for own messages) */}
                              {isMine && !msg.deleted && (
                                <button
                                  onClick={() => { setEditingMessage(msg.id); setEditContent(msg.content); setShowMessageMenu(null); setActiveActionMessageId(null) }}
                                  className="flex items-center gap-2 px-3 py-2 hover:bg-gray-800 w-full text-left text-sm text-white"
                                >
                                  <Edit2 size={14} /> Edit
                                </button>
                              )}
                              {/* Forward */}
                              <button
                                onClick={() => { forwardMessage(msg); setShowMessageMenu(null) }}
                                className="flex items-center gap-2 px-3 py-2 hover:bg-gray-800 w-full text-left text-sm text-white"
                              >
                                <Forward size={14} /> Forward
                              </button>
                              {/* Delete (only for own messages) */}
                              {isMine && !msg.deleted && (
                                <button
                                  onClick={() => { deleteMessage(msg.id); setShowMessageMenu(null); setActiveActionMessageId(null) }}
                                  className="flex items-center gap-2 px-3 py-2 hover:bg-gray-800 w-full text-left text-sm text-red-400"
                                >
                                  <Trash2 size={14} /> Delete
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {showEmojiPicker === msg.id && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setShowEmojiPicker(null)} />
                            <div className={`fixed sm:absolute ${isMine ? 'right-2 sm:right-0' : 'left-2 sm:left-0'} bottom-auto sm:bottom-full mb-0 sm:mb-2 bg-gray-900 border border-gray-700 rounded-lg p-2 flex flex-wrap gap-1 shadow-xl z-50 w-[200px] sm:w-48 max-h-[200px] overflow-y-auto`}
                              style={{
                                top: window.innerWidth < 640 ? '50%' : undefined,
                                transform: window.innerWidth < 640 ? 'translateY(-50%)' : undefined
                              }}
                            >
                              {commonEmojis.map(emoji => (
                                <button
                                  key={emoji}
                                  onClick={() => { addReaction(msg.id, emoji); setActiveActionMessageId(null) }}
                                  className="text-lg hover:scale-125 transition cursor-pointer"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}

              {showSearch && messageSearchQuery && filteredMessages.length === 0 && (
                <div className="text-center text-gray-500 text-sm py-8">No messages found in this chat</div>
              )}
              
              {/* Typing indicator */}
              {typingUsers.length > 0 && (
                <div className="flex items-center gap-2 py-2 text-gray-400 text-xs">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-ig-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-ig-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-ig-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                  <span>Typing...</span>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {/* Message input - sticky at bottom */}
            <div className="sticky bottom-0 p-2 sm:p-3 border-t border-gray-800 bg-black shrink-0 z-20">
              {showRealtimeWarning && !connected && (
                <div className="mb-2 rounded-lg border border-yellow-700/40 bg-yellow-900/30 px-3 py-1.5 text-xs text-yellow-200">
                  Realtime reconnecting. Online status and typing may lag.
                </div>
              )}
              {/* Reply preview */}
              {replyingTo && (
                <div className="mb-2 px-3 py-2 bg-gray-900 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Reply size={16} className="text-gray-400" />
                    <div className="text-sm">
                      <span className="text-gray-400">Replying to </span>
                      <span className="text-white font-medium">{replyingTo.user?.name || 'message'}</span>
                      <p className="text-gray-500 text-xs truncate max-w-48">{replyingTo.content}</p>
                    </div>
                  </div>
                  <button onClick={() => setReplyingTo(null)} className="text-gray-500 hover:text-white p-1">
                    <X size={16} />
                  </button>
                </div>
              )}

              {/* Emoji picker for input */}
              {showInputEmoji && (
                <div className="mb-2 bg-gray-900 border border-gray-700 rounded-lg p-2 flex flex-wrap gap-1">
                  {commonEmojis.map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => insertEmoji(emoji)}
                      className="text-xl hover:scale-125 transition cursor-pointer p-1"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}

              {isActivePrivateChatBlocked() && (
                <div className="mb-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  Messaging is unavailable because one of you has blocked the other.
                </div>
              )}
              <form onSubmit={sendMessage} className="flex items-center gap-1 sm:gap-1.5 md:gap-2 bg-gray-900 border border-gray-800 rounded-full px-2 sm:px-2.5 md:px-3 py-1.5 sm:py-2 min-w-0">
                <button 
                  type="button"
                  disabled={isActivePrivateChatBlocked()}
                  onClick={() => setShowInputEmoji(!showInputEmoji)}
                  className={`${showInputEmoji ? 'text-white' : 'text-gray-500'} cursor-pointer hover:opacity-60 disabled:cursor-not-allowed disabled:opacity-40 shrink-0 p-0.5`}
                >
                  <Smile size={18} className="sm:w-5 sm:h-5" />
                </button>
                <textarea
                  placeholder="Message..."
                  value={newMsg}
                  onChange={e => { setNewMsg(e.target.value); handleTyping() }}
                  onInput={handleTyping}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      if (newMsg.trim()) {
                        e.target.form.requestSubmit()
                      }
                    }
                  }}
                  disabled={isActivePrivateChatBlocked()}
                  rows={1}
                  className="flex-1 bg-transparent outline-none text-xs sm:text-sm text-white placeholder-gray-600 min-w-0 disabled:cursor-not-allowed disabled:text-gray-500 resize-none max-h-20 sm:max-h-24 overflow-y-auto px-1"
                  style={{
                    height: 'auto',
                    minHeight: '18px',
                  }}
                  ref={(el) => {
                    if (el) {
                      el.style.height = 'auto'
                      el.style.height = el.scrollHeight + 'px'
                    }
                  }}
                />
                {newMsg.trim() ? (
                  <button
                    type="submit"
                    disabled={isActivePrivateChatBlocked()}
                    className="text-white font-semibold text-xs sm:text-sm hover:opacity-60 shrink-0 px-1 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Send
                  </button>
                ) : (
                  <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={isActivePrivateChatBlocked()}
                      onClick={toggleRecording}
                      className={`cursor-pointer hover:opacity-60 disabled:cursor-not-allowed disabled:opacity-40 p-0.5 ${recording ? 'text-red-500 animate-pulse' : 'text-gray-500'}`}
                      aria-label={recording ? 'Stop recording and send' : 'Start recording'}
                    >
                      <Mic size={18} className="sm:w-5 sm:h-5" />
                    </button>
                    <label className={`cursor-pointer p-0.5 ${isActivePrivateChatBlocked() ? 'pointer-events-none opacity-40' : ''}`}>
                      <Paperclip size={18} className="sm:w-5 sm:h-5 text-gray-500 hover:opacity-60" />
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        disabled={isActivePrivateChatBlocked()}
                        accept="image/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip,.rar,.7z"
                        className="hidden"
                      />
                    </label>
                    <input
                      type="file"
                      ref={audioCaptureInputRef}
                      onChange={handleAudioCapture}
                      disabled={isActivePrivateChatBlocked()}
                      accept="audio/*"
                      capture="user"
                      className="hidden"
                    />
                    <Heart size={18} className={`sm:w-5 sm:h-5 text-gray-500 cursor-pointer hover:opacity-60 hidden sm:block ${isActivePrivateChatBlocked() ? 'pointer-events-none opacity-40' : ''}`} onClick={() => {
                      setNewMsg('❤️')
                      setTimeout(() => document.querySelector('form')?.requestSubmit(), 0)
                    }} />
                  </div>
                )}
              </form>
              {uploadingMedia && (
                <div className="mt-2 text-center text-sm text-gray-500">
                  Uploading...
                </div>
              )}
              {recording && (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse"></div>
                      <span className="font-medium">Recording</span>
                    </div>
                    <span className="font-mono text-base tabular-nums">{formatDuration(recordingSeconds)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => stopRecordingSession(false)}
                      className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => stopRecordingSession(true)}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black transition hover:scale-[1.03]"
                      aria-label="Stop recording and send"
                    >
                      <Square size={15} fill="currentColor" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Empty state - hidden on mobile since sidebar is shown */
          <div className="flex-1 hidden md:flex items-center justify-center flex-col">
            <div className="text-center">
              <div className="w-24 h-24 border-2 border-gray-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Send size={44} className="text-gray-400 -rotate-12" />
              </div>
              <h2 className="text-xl font-semibold mb-1 text-white">Your messages</h2>
              <p className="text-gray-500 text-sm mb-4">Send private messages to a friend</p>
              <button onClick={() => setShowNewChat(true)} className="bg-white text-black px-4 py-2 rounded-lg font-semibold text-sm hover:bg-gray-200 transition">
                Send message
              </button>
            </div>
          </div>
        )}
      </div>

      {/* New chat modal */}
      {showNewChat && (
        <div className="fixed inset-0 bg-black/65 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl w-full max-w-md flex flex-col border border-gray-800">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <div></div>
              <span className="font-semibold text-sm text-white">New message</span>
              <button onClick={() => { setShowNewChat(false); setSearchQuery(''); setSearchResults([]) }} className="hover:opacity-60 text-white">
                <X size={24} />
              </button>
            </div>
            <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
              <span className="font-semibold text-sm text-white">To:</span>
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={e => searchUsers(e.target.value)}
                className="flex-1 outline-none text-sm bg-transparent text-white placeholder-gray-500"
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-y-auto max-h-80">
              {searchResults.map(u => (
                <div
                  key={u.id}
                  onClick={() => startConversation(u)}
                  className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-gray-800 transition"
                >
                  <img src={getAvatarUrl(u)} className="w-10 h-10 rounded-full object-cover shrink-0" alt="" style={{ aspectRatio: '1 / 1' }} />
                  <div className="flex-1">
                    <p className="font-semibold text-sm text-white">{u.name}</p>
                    <p className="text-gray-500 text-xs">{u.email}</p>
                  </div>
                  {isUserOnline(u.id) && <div className="w-2 h-2 rounded-full bg-green-500"></div>}
                </div>
              ))}
              {searchQuery.length >= 2 && searchResults.length === 0 && (
                <p className="p-4 text-center text-gray-500 text-sm">No users found</p>
              )}
              {searchQuery.length < 2 && (
                <p className="p-4 text-center text-gray-500 text-xs">Search for people to message</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create group modal */}
      {showGroupCreate && (
        <div className="fixed inset-0 bg-black/65 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl w-full max-w-md flex flex-col border border-gray-800">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <button onClick={() => { setShowGroupCreate(false); setGroupName(''); setSelectedUsers([]) }} className="hover:opacity-60 text-white">
                <X size={24} />
              </button>
              <span className="font-semibold text-sm text-white">Create group</span>
              <button 
                onClick={createGroup}
                disabled={!groupName.trim() || selectedUsers.length < 2}
                className="text-blue-400 font-semibold text-sm disabled:opacity-40"
              >
                Create
              </button>
            </div>
            
            <div className="px-4 py-3 border-b border-gray-800">
              <input
                type="text"
                placeholder="Group name"
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                className="w-full outline-none text-sm bg-transparent text-white placeholder-gray-500"
              />
            </div>
            
            {selectedUsers.length > 0 && (
              <div className="px-4 py-2 flex flex-wrap gap-2 border-b border-gray-800">
                {selectedUsers.map(u => (
                  <div key={u.id} className="flex items-center gap-1 px-2 py-1 rounded-full text-sm" style={{ backgroundColor: 'rgba(93, 173, 226, 0.2)', color: '#7EC8F0' }}>
                    {u.name}
                    <button onClick={() => toggleUserSelection(u)} className="hover:opacity-60">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            
            <div className="px-4 py-2 border-b border-gray-800">
              <input
                type="text"
                placeholder="Search people..."
                value={searchQuery}
                onChange={e => searchUsers(e.target.value)}
                className="w-full outline-none text-sm bg-transparent text-white placeholder-gray-500"
              />
            </div>
            
            <div className="flex-1 overflow-y-auto max-h-60">
              {searchResults.map(u => {
                const selected = selectedUsers.find(s => s.id === u.id)
                return (
                  <div
                    key={u.id}
                    onClick={() => toggleUserSelection(u)}
                    className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-gray-800 transition"
                  >
                    <img src={getAvatarUrl(u)} className="w-10 h-10 rounded-full object-cover shrink-0" alt="" style={{ aspectRatio: '1 / 1' }} />
                    <div className="flex-1">
                      <p className="font-semibold text-sm text-white">{u.name}</p>
                      <p className="text-gray-500 text-xs">{u.email}</p>
                    </div>
                    <div 
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selected ? 'border-gray-600' : 'border-gray-600'}`}
                      style={selected ? { backgroundColor: '#5DADE2', borderColor: '#5DADE2' } : {}}
                    >
                      {selected && <Check size={12} className="text-white" />}
                    </div>
                  </div>
                )
              })}
              {searchQuery.length < 2 && (
                <p className="p-4 text-center text-gray-500 text-xs">Search for people to add</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Conversation info panel */}
      {forwardingMessage && (
        <div className="fixed inset-0 bg-black/65 flex items-center justify-center z-50 p-4" onClick={() => setForwardingMessage(null)}>
          <div className="bg-gray-900 rounded-xl w-full max-w-md flex flex-col border border-gray-800" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <span className="font-semibold text-sm text-white">Forward message</span>
              <button onClick={() => setForwardingMessage(null)} className="hover:opacity-60 text-white">
                <X size={24} />
              </button>
            </div>

            <div className="px-4 py-3 border-b border-gray-800">
              <input
                type="text"
                placeholder="Search conversation..."
                value={forwardSearch}
                onChange={(e) => setForwardSearch(e.target.value)}
                className="w-full outline-none text-sm bg-transparent text-white placeholder-gray-500"
              />
            </div>

            <div className="max-h-80 overflow-y-auto">
              {filteredForwardConversations.length === 0 ? (
                <p className="p-4 text-center text-gray-500 text-sm">No conversations found</p>
              ) : (
                filteredForwardConversations.map((conv) => {
                  const other = getOtherUser(conv)
                  return (
                    <button
                      key={conv.id}
                      onClick={() => sendForwardedMessage(conv.id)}
                      disabled={Boolean(forwardingTo)}
                      className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-gray-800 disabled:opacity-50"
                    >
                      {conv.type === 'group' ? (
                        <div className="w-10 h-10 rounded-full bg-linear-to-br from-blue-500 to-cyan-600 flex items-center justify-center text-white text-sm font-semibold">
                          <Users size={18} />
                        </div>
                      ) : (
                        <img src={getAvatarUrl(other)} className="w-10 h-10 rounded-full object-cover shrink-0" alt="" style={{ aspectRatio: '1 / 1' }} />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{other.name}</p>
                        <p className="text-xs text-gray-500 truncate">{getConversationPreviewText(conv.last_message) || 'No messages yet'}</p>
                      </div>
                      {forwardingTo && String(forwardingTo) === String(conv.id) && (
                        <span className="text-xs text-blue-400">Sending...</span>
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}

      {showConvInfo && activeConv && (
        <div className="fixed inset-0 bg-black/65 flex items-center justify-center z-50 p-4" onClick={() => setShowConvInfo(false)}>
          <div className="bg-gray-900 rounded-xl w-full max-w-sm flex flex-col border border-gray-800" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <span className="font-semibold text-white">Details</span>
              <button onClick={() => setShowConvInfo(false)} className="hover:opacity-60 text-white">
                <X size={24} />
              </button>
            </div>
            <div className="p-4 text-center">
              <div className="w-20 h-20 rounded-full bg-linear-to-br from-blue-500 to-cyan-600 flex items-center justify-center text-white text-2xl font-semibold mx-auto mb-3">
                {activeConv.type === 'group' ? <Users size={32} /> : getOtherUser(activeConv).name?.[0]?.toUpperCase()}
              </div>
              <h3 className="font-semibold text-lg text-white">{getOtherUser(activeConv).name}</h3>
              {activeConv.type === 'private' && (
                <p className="text-gray-500 text-sm">
                  {isUserOnline(getOtherUser(activeConv).id) ? 'Active now' : 'Offline'}
                </p>
              )}
            </div>
            {activeConv.type === 'group' && (
              <div className="border-t border-gray-800">
                <div className="px-4 py-2 font-semibold text-sm text-white">Members ({activeConv.members?.length || 0})</div>
                <div className="max-h-50 overflow-y-auto">
                  {activeConv.members?.map(m => (
                    <div key={m.id} className="flex items-center gap-3 px-4 py-2">
                      <div className="w-8 h-8 rounded-full bg-linear-to-br from-blue-500 to-cyan-600 flex items-center justify-center text-white text-xs font-semibold">
                        {m.name?.[0]?.toUpperCase()}
                      </div>
                      <span className="text-sm text-white">{m.name}</span>
                      {isUserOnline(m.id) && <div className="w-2 h-2 rounded-full bg-green-500 ml-auto"></div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showProfilePreview && (
        <div className="fixed inset-0 z-60 bg-linear-to-b from-[#0b1324] via-[#080d18] to-black" onClick={() => setShowProfilePreview(false)}>
          <button
            onClick={() => setShowProfilePreview(false)}
            className="absolute top-4 right-4 rounded-full bg-black/40 p-2 text-white/80 hover:text-white"
          >
            <X size={22} />
          </button>

          <div className="h-full w-full flex flex-col items-center justify-center px-6" onClick={(e) => e.stopPropagation()}>
            {loadingProfilePreview ? (
              <Loader2 className="w-8 h-8 animate-spin text-white/70" />
            ) : profilePreview ? (
              <>
                <div className="relative mb-6">
                  <div className="absolute inset-0 rounded-full blur-3xl bg-cyan-500/20" />
                  <div className="relative w-64 h-64 md:w-72 md:h-72 rounded-full border border-white/15 bg-black/30 overflow-hidden flex items-center justify-center">
                    <img
                      src={getAvatarUrl(profilePreview)}
                      alt={profilePreview.name}
                      className="w-full h-full object-contain"
                    />
                  </div>
                </div>

                <h3 className="text-white text-2xl font-semibold text-center">{profilePreview.name}</h3>
                <p className="text-gray-300 text-sm mt-1">@{profilePreview.username || 'unknown'}</p>

                <div className="mt-8 grid grid-cols-4 gap-5 text-white/90">
                  <button className="flex flex-col items-center gap-2" type="button">
                    <span className="w-14 h-14 rounded-full border border-white/20 flex items-center justify-center bg-black/30">
                      <Users size={22} />
                    </span>
                    <span className="text-xs text-gray-300">Followers</span>
                  </button>

                  <button
                    className="flex flex-col items-center gap-2"
                    type="button"
                    onClick={() => {
                      navigate(`/profile/${profilePreview.id}`)
                      setShowProfilePreview(false)
                    }}
                  >
                    <span className="w-14 h-14 rounded-full border border-white/20 flex items-center justify-center bg-black/30">
                      <Info size={22} />
                    </span>
                    <span className="text-xs text-gray-300">Profile</span>
                  </button>

                  <button className="flex flex-col items-center gap-2" type="button" onClick={copyProfileLink}>
                    <span className="w-14 h-14 rounded-full border border-white/20 flex items-center justify-center bg-black/30">
                      <Copy size={22} />
                    </span>
                    <span className="text-xs text-gray-300">Copy link</span>
                  </button>

                  <button
                    className="flex flex-col items-center gap-2"
                    type="button"
                    onClick={() => {
                      navigate(`/profile/${profilePreview.id}`)
                      setShowProfilePreview(false)
                    }}
                  >
                    <span className="w-14 h-14 rounded-full border border-white/20 flex items-center justify-center bg-black/30">
                      <Send size={20} />
                    </span>
                    <span className="text-xs text-gray-300">Open</span>
                  </button>
                </div>
              </>
            ) : (
              <p className="text-gray-300">Failed to load profile preview.</p>
            )}
          </div>
        </div>
      )}

      {viewingStoryUserIndex !== null && storiesByUser.length > 0 && (
        <StoryViewer
          userStories={storiesByUser}
          initialUserIndex={viewingStoryUserIndex}
          initialStoryIndex={0}
          onClose={closeStoryViewer}
          currentUserId={user?.id}
        />
      )}

      {confirmModal && (
        <div className="fixed inset-0 z-60 bg-black/70 flex items-center justify-center p-4" onClick={closeStyledConfirm}>
          <div className="w-full max-w-sm rounded-2xl border border-gray-800 bg-gray-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-2">
              <h3 className="text-white text-lg font-semibold">{confirmModal.title}</h3>
              <p className="mt-2 text-sm text-gray-400">{confirmModal.message}</p>
            </div>
            <div className="px-5 pb-5 pt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeStyledConfirm}
                disabled={confirmLoading}
                className="px-4 py-2 rounded-lg bg-gray-800 text-white text-sm hover:bg-gray-700 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitStyledConfirm}
                disabled={confirmLoading}
                className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 text-white transition"
                style={confirmModal.tone === 'danger' ? { backgroundColor: '#EF4444' } : { backgroundColor: '#5DADE2' }}
                onMouseEnter={(e) => {
                  if (confirmModal.tone === 'danger') {
                    e.currentTarget.style.backgroundColor = '#DC2626'
                  } else {
                    e.currentTarget.style.backgroundColor = '#4A9FD5'
                  }
                }}
                onMouseLeave={(e) => {
                  if (confirmModal.tone === 'danger') {
                    e.currentTarget.style.backgroundColor = '#EF4444'
                  } else {
                    e.currentTarget.style.backgroundColor = '#5DADE2'
                  }
                }}
              >
                {confirmLoading ? 'Please wait...' : confirmModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {actionToast && (
        <div className="fixed top-5 right-5 z-70">
          <div className={`rounded-xl border px-4 py-2.5 text-sm shadow-xl ${actionToast.type === 'success' ? 'bg-emerald-900/90 border-emerald-600 text-emerald-100' : 'bg-rose-900/90 border-rose-600 text-rose-100'}`}>
            {actionToast.message}
          </div>
        </div>
      )}

    </div>
  )
}
