import axios from 'axios'
import { API_BASE_URL, buildApiUrl } from './utils/backendUrl'

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' }
})

api.interceptors.request.use(config => {
  if (config.data instanceof FormData) {
    // Let the browser/axios set multipart boundaries for FormData.
    if (config.headers?.['Content-Type']) {
      delete config.headers['Content-Type']
    }
    if (config.headers?.common?.['Content-Type']) {
      delete config.headers.common['Content-Type']
    }
  }

  // Use admin token for admin routes, user token for everything else
  const isAdminRoute = config.url?.startsWith('/admin')
  const token = isAdminRoute 
    ? localStorage.getItem('adminToken')
    : localStorage.getItem('token')
  
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  res => res,
  err => {
    const isAdminRoute = err.config?.url?.startsWith('/admin')
    const status = err.response?.status
    const requestUrl = String(err.config?.url || '')
    const isAuthMeRequest = requestUrl.startsWith('/auth/me')
    
    if (isAdminRoute && (status === 401 || status === 403)) {
      localStorage.removeItem('adminToken')
      localStorage.removeItem('admin')
      if (!window.location.pathname.startsWith('/admin/login')) {
        window.location.href = '/admin/login'
      }
    } else if (status === 401 || (status === 403 && isAuthMeRequest)) {
      if (isAdminRoute) {
        localStorage.removeItem('adminToken')
        localStorage.removeItem('admin')
        window.location.href = '/admin/login'
      } else {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        if (window.location.pathname !== '/login') {
          window.location.href = '/login'
        }
      }
    }
    return Promise.reject(err)
  }
)

// Auth endpoints
export const auth = {
  signup: ({ name, username, email, password, studentIdFile, campusId, departmentId, customDepartment }) => {
    const formData = new FormData()
    formData.append('name', name)
    formData.append('username', username)
    formData.append('email', email)
    formData.append('password', password)
    formData.append('password_confirmation', password)
    formData.append('student_id_image', studentIdFile)
    formData.append('campus_id', campusId)
    formData.append('department_id', departmentId)
    if (customDepartment) formData.append('custom_department', customDepartment)
    return api.post('/auth/signup', formData)
  },
  resendVerification: data => api.post('/auth/email/resend', data),
  forgotPassword: data => api.post('/auth/password/forgot', data),
  resetPassword: data => api.post('/auth/password/reset', data),
  login: data => api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  heartbeat: () => api.post('/auth/heartbeat'),
}

// Campus endpoints
export const campuses = {
  list: () => api.get('/campuses')
}

// Conversation endpoints
export const conversations = {
  list: (params) => api.get('/conversations', { params }),
  create: data => api.post('/conversations', data),
  get: id => api.get(`/conversations/${id}`),
  update: (id, data) => api.put(`/conversations/${id}`, data),
  delete: id => api.delete(`/conversations/${id}`),
  clearHistory: id => api.delete(`/conversations/${id}/messages`),
  addMember: (id, userId) => api.post(`/conversations/${id}/members`, { user_id: userId }),
  removeMember: (id, userId) => api.delete(`/conversations/${id}/members/${userId}`),
  getPinned: id => api.get(`/conversations/${id}/pinned`),
  pin: (convId, msgId) => api.post(`/conversations/${convId}/pinned/${msgId}`),
  unpin: (convId, msgId) => api.delete(`/conversations/${convId}/pinned/${msgId}`),
  markSeen: id => api.put(`/conversations/${id}/mark-seen`)
}

// Message endpoints
export const messages = {
  list: (convId, params) => api.get(`/conversations/${convId}/messages`, { params }),
  send: (convId, data) => api.post(`/conversations/${convId}/messages`, data),
  edit: (id, content) => api.put(`/messages/${id}`, { content }),
  delete: id => api.delete(`/messages/${id}`),
  react: (id, emoji) => api.post(`/messages/${id}/reactions`, { emoji }),
  removeReaction: (id, emoji) => api.delete(`/messages/${id}/reactions/${encodeURIComponent(emoji)}`),
  star: id => api.post(`/messages/${id}/star`),
  unstar: id => api.delete(`/messages/${id}/star`),
  markDelivered: id => api.put(`/messages/${id}/status/delivered`),
  markSeen: id => api.put(`/messages/${id}/status/seen`),
  getStatus: id => api.get(`/messages/${id}/status`),
  getUnreadCount: () => api.get('/messages/unread-count')
}

// User endpoints
export const users = {
  get: id => api.get(`/users/${id}`),
  search: q => api.get('/users/search', { params: { q } }),
  update: (id, data) => api.put(`/users/${id}`, data),
  changePassword: (id, data) => api.put(`/users/${id}/password`, data),
  uploadAvatar: (id, file) => {
    const formData = new FormData()
    formData.append('avatar', file)
    return api.post(`/users/${id}/avatar`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  deleteAvatar: id => api.delete(`/users/${id}/avatar`),
  block: id => api.post(`/users/${id}/block`),
  unblock: id => api.delete(`/users/${id}/block`),
  getBlocked: id => api.get(`/users/${id}/blocked`)
}

// Search endpoints
export const search = {
  messages: params => api.get('/search', { params })
}

// Media endpoints
export const media = {
  upload: file => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/upload', formData)
  },
  get: id => api.get(`/media/${id}`),
  download: id => api.get(`/media/${id}`, { responseType: 'blob' })
}

// Post endpoints
export const posts = {
  getFeed: (params) => api.get('/feed', { params }),
  getUserPosts: (userId, params) => api.get(`/users/${userId}/posts`, { params }),
  create: (formData) => {
    // Accepts FormData directly (for media/images/videos)
    return api.post('/posts', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  get: (postId) => api.get(`/posts/${postId}`),
  update: (postId, data) => api.put(`/posts/${postId}`, data),
  delete: (postId) => api.delete(`/posts/${postId}`),
  like: (postId) => api.post(`/posts/${postId}/like`),
  unlike: (postId) => api.delete(`/posts/${postId}/like`),
  share: (postId) => api.post(`/posts/${postId}/share`),
}

// Comment endpoints
export const comments = {
  list: (postId, params) => api.get(`/posts/${postId}/comments`, { params }),
  create: (postId, data) => api.post(`/posts/${postId}/comments`, data),
  update: (commentId, data) => api.put(`/comments/${commentId}`, data),
  delete: (commentId) => api.delete(`/comments/${commentId}`),
  like: (commentId) => api.post(`/comments/${commentId}/like`),
  unlike: (commentId) => api.delete(`/comments/${commentId}/like`),
  getReplies: (commentId) => api.get(`/comments/${commentId}/replies`),
}

// Friend endpoints
export const friends = {
  suggestions: (limit) => api.get('/friends/suggestions', { params: { limit } }),
  list: () => api.get('/friends'),
  sendRequest: (friendId) => api.post('/friends/request', { friend_id: friendId }),
  getRequests: () => api.get('/friends/requests'),
  respondToRequest: (id, status) => api.put(`/friends/requests/${id}`, { status }),
  remove: (id) => api.delete(`/friends/${id}`),
}

// Follow endpoints
export const follows = {
  follow: (userId) => api.post(`/follows/${userId}`),
  unfollow: (userId) => api.delete(`/follows/${userId}`),
  getRequests: () => api.get('/follows/requests'),
  getActivity: () => api.get('/follows/activity'),
  respondToRequest: (followId, data) => api.put(`/follows/requests/${followId}`, data),
  removeFollower: (userId) => api.delete(`/follows/followers/${userId}`),
  getFollowers: (userId) => api.get(`/users/${userId}/followers`),
  getFollowing: (userId) => api.get(`/users/${userId}/following`),
}

export const notifications = {
  markMentionsRead: () => api.post('/notifications/mentions/read'),
}

// Story endpoints
export const stories = {
  getAll: () => api.get('/stories'),
  getById: (storyId) => api.get(`/stories/${storyId}`),
  getUserStories: (userId) => api.get(`/users/${userId}/stories`),
  upload: (files, caption = '') => {
    const formData = new FormData()

    const list = Array.isArray(files) ? files : [files]
    list.filter(Boolean).forEach((file) => formData.append('media_files[]', file))

    if (caption?.trim()) formData.append('caption', caption.trim())
    return api.post('/stories', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  view: (storyId) => api.post(`/stories/${storyId}/view`),
  like: (storyId) => api.post(`/stories/${storyId}/like`),
  unlike: (storyId) => api.delete(`/stories/${storyId}/like`),
  repost: (storyId, caption = '') => api.post(`/stories/${storyId}/repost`, {
    caption: caption || null
  }),
  reply: (storyId, content) => api.post(`/stories/${storyId}/reply`, { content }),
  getViewers: (storyId) => api.get(`/stories/${storyId}/viewers`),
  update: (storyId, data) => api.put(`/stories/${storyId}`, data),
  delete: (storyId) => api.delete(`/stories/${storyId}`),
  getMediaUrl: (storyId) => {
    const token = localStorage.getItem('token')
    return buildApiUrl(`/stories/${storyId}/media${token ? `?token=${encodeURIComponent(token)}` : ''}`)
  },
}

// User reports
export const reports = {
  submit: (data) => api.post('/reports', data),
}

// Admin endpoints
export const admin = {
  // Auth
  login: (data) => api.post('/admin/auth/login', data),
  logout: () => api.post('/admin/auth/logout'),
  me: () => api.get('/admin/auth/me'),
  
  // Dashboard
  getStats: () => api.get('/admin/stats'),
  
  // User Management
  getPendingUsers: () => api.get('/admin/users/pending'),
  getUsers: (params) => api.get('/admin/users', { params }),
  approveUser: (userId) => api.put(`/admin/users/${userId}/approve`),
  rejectUser: (userId) => api.delete(`/admin/users/${userId}/reject`),
  banUser: (userId) => api.put(`/admin/users/${userId}/ban`),
  unbanUser: (userId) => api.put(`/admin/users/${userId}/unban`),
  deleteUser: (userId) => api.delete(`/admin/users/${userId}`),
  
  // Content Moderation
  getPosts: (params) => api.get('/admin/posts', { params }),
  deletePost: (postId) => api.delete(`/admin/posts/${postId}`),
  getStories: (params) => api.get('/admin/stories', { params }),
  deleteStory: (storyId) => api.delete(`/admin/stories/${storyId}`),
  deleteComment: (commentId) => api.delete(`/admin/comments/${commentId}`),
  
  // Reports
  getReports: (params) => api.get('/admin/reports', { params }),
  reviewReport: (reportId, data) => api.put(`/admin/reports/${reportId}`, data),
}

export default api
