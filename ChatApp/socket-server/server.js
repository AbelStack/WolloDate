const { Server } = require('socket.io')
const http = require('http')
const fs = require('fs')
const path = require('path')

const server = http.createServer()
function readEnvValue(filePath, key) {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    const line = content
      .split(/\r?\n/)
      .find((entry) => entry.startsWith(`${key}=`))

    if (!line) return null

    return line.slice(key.length + 1).replace(/^['\"]|['\"]$/g, '').trim()
  } catch {
    return null
  }
}

const frontendUrl = process.env.FRONTEND_URL
  || readEnvValue(path.join(__dirname, '.env'), 'FRONTEND_URL')
  || readEnvValue(path.join(__dirname, '..', 'backend', '.env'), 'FRONTEND_URL')

const envAllowedOrigins = process.env.ALLOWED_ORIGINS
  || readEnvValue(path.join(__dirname, '.env'), 'ALLOWED_ORIGINS')
  || readEnvValue(path.join(__dirname, '..', 'backend', '.env'), 'ALLOWED_ORIGINS')

const defaultAllowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  frontendUrl
].filter(Boolean)

const configuredOrigins = (envAllowedOrigins || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const allowedOrigins = [...new Set([...defaultAllowedOrigins, ...configuredOrigins])]

const io = new Server(server, {
  pingInterval: 10000,
  pingTimeout: 5000,
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
})

// Backend API URL for token validation
const API_URL = process.env.API_URL
  || readEnvValue(path.join(__dirname, '.env'), 'API_URL')
  || readEnvValue(path.join(__dirname, '..', 'backend', '.env'), 'API_URL')
  || readEnvValue(path.join(__dirname, '..', 'backend', '.env'), 'APP_URL')
  || 'http://localhost:8000'

// Authenticate socket connections by validating Sanctum token against the Laravel backend
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token
  if (!token) {
    return next(new Error('Authentication required'))
  }

  try {
    const response = await fetch(`${API_URL}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
    })
    if (!response.ok) {
      return next(new Error('Invalid token'))
    }
    const data = await response.json()
    socket.userId = data.user?.id || data.id
    socket.userName = data.user?.name || data.name
    if (!socket.userId) {
      return next(new Error('Invalid token'))
    }

    next()
  } catch {
    return next(new Error('Authentication failed'))
  }
})

// Store online users with multi-socket support (tabs/devices)
const onlineUsers = new Map() // userId -> { name, sockets: Set<socketId>, lastHeartbeatAt }
const userSockets = new Map() // socketId -> userId

function normalizeUserId(userId) {
  return String(userId)
}

function getOnlineUsersList() {
  return Array.from(onlineUsers.entries()).map(([id, data]) => ({
    userId: id,
    name: data.name
  }))
}

function registerPresence(socket) {
  const userId = normalizeUserId(socket.userId)
  const name = socket.userName
  const now = Date.now()

  const existing = onlineUsers.get(userId)
  const isFirstSocket = !existing

  const entry = existing || { name, sockets: new Set(), lastHeartbeatAt: now }
  entry.name = name
  entry.lastHeartbeatAt = now
  entry.sockets.add(socket.id)

  onlineUsers.set(userId, entry)
  userSockets.set(socket.id, userId)

  if (isFirstSocket) {
    io.emit('user:online', { userId, name })
    console.log(`[Socket] User online: ${name} (${userId})`)
  }
}

function unregisterPresence(socket, reason = 'disconnect') {
  const userId = userSockets.get(socket.id)
  if (!userId) {
    return
  }

  const userData = onlineUsers.get(userId)
  if (!userData) {
    userSockets.delete(socket.id)
    return
  }

  userData.sockets.delete(socket.id)
  userSockets.delete(socket.id)

  if (userData.sockets.size === 0) {
    onlineUsers.delete(userId)
    io.emit('user:offline', { userId, name: userData?.name })
    console.log(`[Socket] User offline (${reason}): ${userData?.name} (${userId})`)
    return
  }

  userData.lastHeartbeatAt = Date.now()
}

io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`)

  // Immediately register presence for fast status updates.
  void registerPresence(socket)

  // Send current online users to the connected client.
  socket.emit('users:online', getOnlineUsersList())

  // User joins - register their presence (uses server-verified userId)
  socket.on('user:join', () => {
    void registerPresence(socket)
    socket.emit('users:online', getOnlineUsersList())
    console.log(`[Socket] User join heartbeat: ${socket.userName} (${socket.userId})`)
  })

  // App-level heartbeat to keep presence fresh even during silent periods.
  socket.on('presence:heartbeat', () => {
    const userId = userSockets.get(socket.id)
    if (!userId) return

    const userData = onlineUsers.get(userId)
    if (!userData) return

    userData.lastHeartbeatAt = Date.now()
  })

  // Join conversation room
  socket.on('conversation:join', (conversationId) => {
    socket.join(`conversation:${conversationId}`)
    console.log(`[Socket] Socket ${socket.id} joined conversation ${conversationId}`)
  })

  // Leave conversation room
  socket.on('conversation:leave', (conversationId) => {
    socket.leave(`conversation:${conversationId}`)
    console.log(`[Socket] Socket ${socket.id} left conversation ${conversationId}`)
  })

  // New message
  socket.on('message:new', (data) => {
    const { conversationId, message, memberIds } = data
    const roomName = `conversation:${conversationId}`

    // Broadcast to all room members except sender.
    socket.to(roomName).emit('message:new', {
      conversationId,
      message
    })

    // Track sockets already reached via room broadcast so we do not double-send.
    const alreadyNotifiedSocketIds = new Set()
    const room = io.sockets.adapter.rooms.get(roomName)
    if (room) {
      room.forEach((socketId) => {
        if (socketId !== socket.id) {
          alreadyNotifiedSocketIds.add(socketId)
        }
      })
    }

    // Auto-push unread:refresh to all conversation members who are online
    // (except the sender) — replaces client-side loop
    const senderId = userSockets.get(socket.id)
    if (memberIds && Array.isArray(memberIds)) {
      memberIds.forEach(uid => {
        const normalizedUid = normalizeUserId(uid)
        if (normalizedUid !== senderId) {
          const target = onlineUsers.get(normalizedUid)
          if (target && target.sockets.size > 0) {
            target.sockets.forEach((targetSocketId) => {
              // Ensure recipient gets the actual realtime message payload
              // even if they are not currently joined to the conversation room.
              if (!alreadyNotifiedSocketIds.has(targetSocketId)) {
                io.to(targetSocketId).emit('message:new', {
                  conversationId,
                  message
                })
              }
              io.to(targetSocketId).emit('unread:refresh')
            })
          }
        }
      })
    }
    console.log(`[Socket] New message in conversation ${conversationId}`)
  })

  // Message edited
  socket.on('message:edited', (data) => {
    const { conversationId, messageId, content } = data
    socket.to(`conversation:${conversationId}`).emit('message:edited', {
      conversationId,
      messageId,
      content
    })
  })

  // Message deleted
  socket.on('message:deleted', (data) => {
    const { conversationId, messageId } = data
    socket.to(`conversation:${conversationId}`).emit('message:deleted', {
      conversationId,
      messageId
    })
  })

  // Message reaction
  socket.on('message:reaction', (data) => {
    const { conversationId, messageId, emoji, userId, action } = data
    socket.to(`conversation:${conversationId}`).emit('message:reaction', {
      conversationId,
      messageId,
      emoji,
      userId,
      action // 'add' or 'remove'
    })
  })

  // Message status update (delivered, seen)
  socket.on('message:status', (data) => {
    const { conversationId, messageId, status, userId } = data
    socket.to(`conversation:${conversationId}`).emit('message:status', {
      conversationId,
      messageId,
      status,
      userId
    })
  })

  // Conversation unread count updated (after messages marked as seen)
  socket.on('conversation:unread_updated', (data) => {
    const { conversationId, userId } = data
    // Broadcast to everyone in the conversation room (including sender's other tabs)
    io.to(`conversation:${conversationId}`).emit('conversation:unread_updated', {
      conversationId,
      userId
    })
    console.log(`[Socket] Unread updated in conversation ${conversationId} by user ${userId}`)
  })

  // Global unread refresh — notify a specific user to re-fetch their unread counts
  // Used when a new message is sent to notify the receiver even if not in the conv room
  socket.on('unread:refresh', (data) => {
    const { targetUserId } = data
    // Find the target user's sockets and send refresh signal to all tabs/devices.
    const targetUser = onlineUsers.get(normalizeUserId(targetUserId))
    if (targetUser && targetUser.sockets.size > 0) {
      targetUser.sockets.forEach((targetSocketId) => {
        io.to(targetSocketId).emit('unread:refresh')
      })
      console.log(`[Socket] Sent unread:refresh to user ${targetUserId}`)
    }
  })

  // Follow notification — notify target user to refresh their activity counts
  socket.on('follow:notify', (data) => {
    const { targetUserId } = data
    const targetUser = onlineUsers.get(normalizeUserId(targetUserId))
    if (targetUser && targetUser.sockets.size > 0) {
      targetUser.sockets.forEach((targetSocketId) => {
        io.to(targetSocketId).emit('follow:notify')
      })
      console.log(`[Socket] Sent follow:notify to user ${targetUserId}`)
    }
  })

  // Typing indicator
  socket.on('user:typing', (data) => {
    const { conversationId, userId, userName, isTyping } = data
    socket.to(`conversation:${conversationId}`).emit('user:typing', {
      conversationId,
      userId,
      userName,
      isTyping
    })
  })

  // Member added to conversation
  socket.on('conversation:member_added', (data) => {
    const { conversationId, userId, userName } = data
    io.to(`conversation:${conversationId}`).emit('conversation:member_added', {
      conversationId,
      userId,
      userName
    })
  })

  // Member removed from conversation
  socket.on('conversation:member_removed', (data) => {
    const { conversationId, userId } = data
    io.to(`conversation:${conversationId}`).emit('conversation:member_removed', {
      conversationId,
      userId
    })
  })

  // Handle disconnection
  socket.on('disconnect', () => {
    void unregisterPresence(socket, 'disconnect')
    console.log(`[Socket] Client disconnected: ${socket.id}`)
  })
})

// Safety net: prune stale socket IDs if a process/network issue skips disconnect.
setInterval(() => {
  for (const [userId, userData] of onlineUsers.entries()) {
    const staleSocketIds = []
    userData.sockets.forEach((socketId) => {
      if (!io.sockets.sockets.has(socketId)) {
        staleSocketIds.push(socketId)
      }
    })

    if (staleSocketIds.length === 0) continue

    staleSocketIds.forEach((socketId) => {
      userData.sockets.delete(socketId)
      userSockets.delete(socketId)
    })

    if (userData.sockets.size === 0) {
      onlineUsers.delete(userId)
      io.emit('user:offline', { userId, name: userData?.name })
      console.log(`[Socket] User offline (stale prune): ${userData?.name} (${userId})`)
    }
  }
}, 10000)

const PORT = process.env.PORT || 3001
server.listen(PORT, () => {
  console.log(`[Socket Server] Running on port ${PORT}`)
  console.log(`[Socket Server] CORS enabled for: ${allowedOrigins.join(', ')}`)
})
