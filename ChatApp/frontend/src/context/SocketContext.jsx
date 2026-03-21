import { useEffect, useState, useRef, useCallback } from 'react'
import { io } from 'socket.io-client'
import { useAuth } from './AuthContext'
import { SocketContext } from './socket-context'
import { conversations as convApi, follows, messages as msgApi } from '../api'

// Helper: compute global unread count from conversation list
function sumUnread(convs) {
  return (convs || []).reduce((sum, c) => sum + Number(c.unread_count || 0), 0)
}

export function SocketProvider({ children }) {
  const { user } = useAuth()
  const [socket, setSocket] = useState(null)
  const [connected, setConnected] = useState(false)
  const [onlineUsers, setOnlineUsers] = useState(new Map())
  const [typingUsers, setTypingUsers] = useState(new Map())
  const [unreadChatCount, setUnreadChatCount] = useState(0)
  const [alertCount, setAlertCount] = useState(0)
  const alertSuppressedUntilRef = useRef(0)
  const socketRef = useRef(null)
  const typingTimeoutsRef = useRef(new Map())
  const activeConvRef = useRef(null)
  const refreshCountsRef = useRef(null)
  const notificationRefreshTimerRef = useRef(null)
  const lastNotificationRefreshAtRef = useRef(0)
  const joinedConversationsRef = useRef(new Set())

  const devSocketUrl = `${window.location.protocol}//${window.location.hostname}:3001`
  const socketUrl = import.meta.env.VITE_SOCKET_URL || (import.meta.env.DEV ? devSocketUrl : window.location.origin)
  const socketPath = import.meta.env.VITE_SOCKET_PATH || '/socket.io'

  // Initialize socket connection
  useEffect(() => {
    if (!user) {
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
        setSocket(null)
        setConnected(false)
      }
      return
    }

    const token = localStorage.getItem('token')
    if (!token) return

    const newSocket = io(socketUrl, {
      path: socketPath,
      auth: { token },
      transports: ['websocket'],
      upgrade: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      autoConnect: false
    })

    newSocket.on('connect', () => {
      console.log('[Socket] Connected')
      setConnected(true)
      // Register user presence (server uses token-verified identity)
      newSocket.emit('user:join')
      newSocket.emit('presence:heartbeat')

      // Re-join any rooms requested before the socket connected
      joinedConversationsRef.current.forEach((conversationId) => {
        newSocket.emit('conversation:join', conversationId)
      })
    })

    newSocket.on('disconnect', () => {
      console.log('[Socket] Disconnected')
      setConnected(false)
    })

    newSocket.on('connect_error', (err) => {
      console.warn('[Socket] Connect error:', err?.message || 'unknown')
    })

    // Handle online users list
    newSocket.on('users:online', (users) => {
      const map = new Map()
      users.forEach(u => map.set(String(u.userId), u.name))
      setOnlineUsers(map)
    })

    // Handle user coming online
    newSocket.on('user:online', ({ userId, name }) => {
      setOnlineUsers(prev => {
        const next = new Map(prev)
        next.set(String(userId), name)
        return next
      })
    })

    // Handle user going offline
    newSocket.on('user:offline', ({ userId }) => {
      setOnlineUsers(prev => {
        const next = new Map(prev)
        next.delete(String(userId))
        return next
      })
    })

    // Handle typing indicators
    newSocket.on('user:typing', ({ conversationId, userId, userName, isTyping }) => {
      const convKey = String(conversationId)
      setTypingUsers(prev => {
        const next = new Map(prev)
        const current = next.get(convKey) || []
        const normalizedUserId = String(userId)
        
        if (isTyping) {
          if (!current.find(u => String(u.userId) === normalizedUserId)) {
            next.set(convKey, [...current, { userId: normalizedUserId, userName }])
          }
        } else {
          next.set(convKey, current.filter(u => String(u.userId) !== normalizedUserId))
        }
        return next
      })

      // Auto-clear typing after 5 seconds
      const timeoutKey = `${convKey}-${userId}`
      if (typingTimeoutsRef.current.has(timeoutKey)) {
        clearTimeout(typingTimeoutsRef.current.get(timeoutKey))
      }
      if (isTyping) {
        typingTimeoutsRef.current.set(timeoutKey, setTimeout(() => {
          setTypingUsers(prev => {
            const next = new Map(prev)
            const current = next.get(convKey) || []
            next.set(convKey, current.filter(u => String(u.userId) !== String(userId)))
            return next
          })
        }, 5000))
      }
    })

    socketRef.current = newSocket
    setSocket(newSocket)
    newSocket.connect()

    const heartbeatInterval = setInterval(() => {
      if (newSocket.connected) {
        newSocket.emit('presence:heartbeat')
      }
    }, 8000)

    const handleVisibilityHeartbeat = () => {
      if (!document.hidden && newSocket.connected) {
        newSocket.emit('presence:heartbeat')
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityHeartbeat)

    // Listen for global unread refresh signal from server
    newSocket.on('unread:refresh', () => {
      console.log('[Socket] Received unread:refresh — refetching counts')
      if (refreshCountsRef.current) refreshCountsRef.current()
    })

    // Listen for follow notification push from server
    newSocket.on('follow:notify', () => {
      console.log('[Socket] Received follow:notify — refetching counts')
      if (refreshCountsRef.current) refreshCountsRef.current()
    })

    return () => {
      clearInterval(heartbeatInterval)
      document.removeEventListener('visibilitychange', handleVisibilityHeartbeat)
      newSocket.off('unread:refresh')
      newSocket.off('follow:notify')
      newSocket.disconnect()
      socketRef.current = null
    }
  }, [user, socketUrl, socketPath])

  // Fetch notification counts — DB-driven via conversations.list + follows.activity
  // This is the SINGLE SOURCE OF TRUTH for unread chat count
  const refreshNotificationCounts = useCallback(async () => {
    if (!user) return
    try {
      // Conversations list already includes per-conv unread_count from DB
      const convRes = await convApi.list()
      const convs = Array.isArray(convRes.data)
        ? convRes.data
        : (convRes.data?.data || [])
      const totalUnread = sumUnread(convs)
      setUnreadChatCount(totalUnread)
      
      const actRes = await follows.getActivity()
      if (Date.now() > alertSuppressedUntilRef.current) {
        setAlertCount(actRes.data?.badge_count ?? actRes.data?.pending_count ?? 0)
      }

      lastNotificationRefreshAtRef.current = Date.now()
    } catch (e) { /* ignore */ }
  }, [user])

  // Coalesce bursty socket events so unread/activity endpoints are not spammed.
  const scheduleNotificationRefresh = useCallback(() => {
    if (!user) return

    const now = Date.now()
    const minIntervalMs = 1200
    const elapsed = now - lastNotificationRefreshAtRef.current
    const waitMs = elapsed >= minIntervalMs ? 120 : (minIntervalMs - elapsed)

    if (notificationRefreshTimerRef.current) {
      clearTimeout(notificationRefreshTimerRef.current)
    }

    notificationRefreshTimerRef.current = setTimeout(() => {
      refreshNotificationCounts()
    }, waitMs)
  }, [user, refreshNotificationCounts])

  // Keep ref in sync so socket handler always calls latest version
  useEffect(() => {
    refreshCountsRef.current = scheduleNotificationRefresh
  }, [scheduleNotificationRefresh])

  // Suppress alert count (called when user opens notifications)
  const clearAlertBadge = useCallback(() => {
    setAlertCount(0)
    // Suppress polling from restoring alert count for 60 seconds
    alertSuppressedUntilRef.current = Date.now() + 60000
  }, [])

  // Poll notification counts (15s fallback — real-time updates arrive via socket)
  useEffect(() => {
    if (!user) return
    refreshNotificationCounts()

    let interval = setInterval(refreshNotificationCounts, 15000)

    // Pause polling when tab is hidden, refresh immediately when visible
    const handleVisibility = () => {
      if (document.hidden) {
        clearInterval(interval)
        interval = null
      } else {
        // Tab became visible — fetch now, then resume polling
        refreshNotificationCounts()
        interval = setInterval(refreshNotificationCounts, 15000)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
      if (notificationRefreshTimerRef.current) {
        clearTimeout(notificationRefreshTimerRef.current)
      }
    }
  }, [user, refreshNotificationCounts])

  // Track which conversation is active so we can skip its notifications
  const setActiveConversation = useCallback((id) => {
    activeConvRef.current = id ? String(id) : null
  }, [])

  // Join a conversation room
  const joinConversation = useCallback((conversationId) => {
    if (!conversationId) return
    const convKey = String(conversationId)
    joinedConversationsRef.current.add(convKey)

    if (socketRef.current?.connected) {
      socketRef.current.emit('conversation:join', convKey)
    }
  }, [])

  // Leave a conversation room
  const leaveConversation = useCallback((conversationId) => {
    if (!conversationId) return
    const convKey = String(conversationId)
    joinedConversationsRef.current.delete(convKey)

    if (socketRef.current?.connected) {
      socketRef.current.emit('conversation:leave', convKey)
    }
  }, [])

  // Send typing indicator
  const sendTyping = useCallback((conversationId, isTyping) => {
    if (socketRef.current?.connected && user) {
      socketRef.current.emit('user:typing', {
        conversationId,
        userId: user.id,
        userName: user.name,
        isTyping
      })
    }
  }, [user])

  // Emit new message (includes memberIds so server can push unread:refresh)
  const emitNewMessage = useCallback((conversationId, message, memberIds) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('message:new', { conversationId, message, memberIds })
    }
  }, [])

  // Emit message edited
  const emitMessageEdited = useCallback((conversationId, messageId, content) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('message:edited', { conversationId, messageId, content })
    }
  }, [])

  // Emit message deleted
  const emitMessageDeleted = useCallback((conversationId, messageId) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('message:deleted', { conversationId, messageId })
    }
  }, [])

  // Emit reaction
  const emitReaction = useCallback((conversationId, messageId, emoji, action) => {
    if (socketRef.current?.connected && user) {
      socketRef.current.emit('message:reaction', {
        conversationId,
        messageId,
        emoji,
        userId: user.id,
        action
      })
    }
  }, [user])

  // Emit message status
  const emitMessageStatus = useCallback((conversationId, messageId, status) => {
    if (socketRef.current?.connected && user) {
      socketRef.current.emit('message:status', {
        conversationId,
        messageId,
        status,
        userId: user.id
      })
    }
  }, [user])

  // Emit conversation unread updated (after bulk mark-seen)
  const emitConversationRead = useCallback((conversationId) => {
    if (socketRef.current?.connected && user) {
      socketRef.current.emit('conversation:unread_updated', {
        conversationId,
        userId: user.id
      })
    }
  }, [user])

  // Notify a user about a new follow / follow-request
  const emitFollowNotify = useCallback((targetUserId) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('follow:notify', { targetUserId })
    }
  }, [])

  // Check if user is online
  const isUserOnline = useCallback((userId) => {
    return onlineUsers.has(String(userId))
  }, [onlineUsers])

  // Get typing users for a conversation
  const getTypingUsers = useCallback((conversationId) => {
    return typingUsers.get(String(conversationId)) || []
  }, [typingUsers])

  const value = {
    socket,
    connected,
    onlineUsers,
    isUserOnline,
    joinConversation,
    leaveConversation,
    sendTyping,
    getTypingUsers,
    emitNewMessage,
    emitMessageEdited,
    emitMessageDeleted,
    emitReaction,
    emitMessageStatus,
    emitConversationRead,
    emitFollowNotify,
    unreadChatCount,
    setUnreadChatCount,
    alertCount,
    setAlertCount,
    refreshNotificationCounts,
    setActiveConversation,
    clearAlertBadge
  }

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  )
}
