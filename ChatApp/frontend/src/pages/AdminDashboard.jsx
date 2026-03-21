import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { admin } from '../api'
import { useAdminAuth } from '../context/AdminAuthContext'
import { resolveMediaUrl } from '../utils/media'
import { getAvatarUrl } from '../utils/avatar'
import { 
  Shield, Users, UserCheck, Clock, CheckCircle, XCircle, Ban, Eye, Loader2, Search,
  Trash2, ShieldOff, UserX, AlertTriangle, RefreshCw, ChevronLeft, ChevronRight, LogOut,
  Image, Film, Flag, FileText
} from 'lucide-react'

export default function AdminDashboard() {
  const navigate = useNavigate()
  const { admin: adminUser, logout } = useAdminAuth()
  const [activeTab, setActiveTab] = useState('verification')
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(null)
  const [selectedImage, setSelectedImage] = useState(null)
  const [confirmModal, setConfirmModal] = useState(null)
  
  // Verification state
  const [pendingUsers, setPendingUsers] = useState([])
  
  // Content state
  const [posts, setPosts] = useState([])
  const [stories, setStories] = useState([])
  const [contentPagination, setContentPagination] = useState({ current_page: 1, last_page: 1, total: 0 })
  const [contentLoading, setContentLoading] = useState(false)
  const [contentType, setContentType] = useState('posts')
  const [contentSearch, setContentSearch] = useState('')
  
  // Users state  
  const [allUsers, setAllUsers] = useState([])
  const [usersPagination, setUsersPagination] = useState({ current_page: 1, last_page: 1, total: 0 })
  const [usersLoading, setUsersLoading] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [showBanned, setShowBanned] = useState(false)
  
  // Reports state
  const [reports, setReports] = useState([])
  const [reportsPagination, setReportsPagination] = useState({ current_page: 1, last_page: 1, total: 0 })
  const [reportsLoading, setReportsLoading] = useState(false)
  const [reportStatus, setReportStatus] = useState('pending')

  useEffect(() => {
    loadInitialData()
  }, [])

  useEffect(() => {
    if (activeTab === 'content') loadContent()
    else if (activeTab === 'users') loadUsers()
    else if (activeTab === 'reports') loadReports()
  }, [activeTab, contentType, showBanned, reportStatus])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeTab === 'content') loadContent()
      else if (activeTab === 'users') loadUsers()
    }, 300)
    return () => clearTimeout(timer)
  }, [contentSearch, userSearch])

  const loadInitialData = async () => {
    try {
      const [statsRes, pendingRes] = await Promise.all([admin.getStats(), admin.getPendingUsers()])
      setStats(statsRes.data)
      setPendingUsers(pendingRes.data)
    } catch (err) { console.error('Failed to load admin data', err) }
    finally { setLoading(false) }
  }

  const loadContent = useCallback(async (page = 1) => {
    setContentLoading(true)
    try {
      const params = { page }
      if (contentSearch) params.search = contentSearch
      const res = contentType === 'posts' ? await admin.getPosts(params) : await admin.getStories(params)
      contentType === 'posts' ? setPosts(res.data.data) : setStories(res.data.data)
      setContentPagination({ current_page: res.data.current_page, last_page: res.data.last_page, total: res.data.total })
    } catch (err) { console.error('Failed to load content', err) }
    finally { setContentLoading(false) }
  }, [contentSearch, contentType])

  const loadUsers = useCallback(async (page = 1) => {
    setUsersLoading(true)
    try {
      const params = { page }
      if (userSearch) params.search = userSearch
      if (showBanned) params.banned = true
      const res = await admin.getUsers(params)
      setAllUsers(res.data.data)
      setUsersPagination({ current_page: res.data.current_page, last_page: res.data.last_page, total: res.data.total })
    } catch (err) { console.error('Failed to load users', err) }
    finally { setUsersLoading(false) }
  }, [userSearch, showBanned])

  const loadReports = useCallback(async (page = 1) => {
    setReportsLoading(true)
    try {
      const params = { page, status: reportStatus }
      const res = await admin.getReports(params)
      setReports(res.data.data)
      setReportsPagination({ current_page: res.data.current_page, last_page: res.data.last_page, total: res.data.total })
    } catch (err) { console.error('Failed to load reports', err) }
    finally { setReportsLoading(false) }
  }, [reportStatus])

  const handleApprove = async (userId) => {
    setActionLoading(userId)
    try {
      await admin.approveUser(userId)
      setPendingUsers(prev => prev.filter(u => u.id !== userId))
      setStats(prev => prev ? { ...prev, pending_users: prev.pending_users - 1, total_users: prev.total_users + 1 } : null)
    } catch (err) { console.error('Failed to approve', err); alert('Failed to approve user') }
    finally { setActionLoading(null) }
  }

  const handleReject = async (userId) => {
    setConfirmModal({
      title: 'Reject Registration', type: 'danger',
      message: 'Reject this registration? This will delete the account permanently.',
      onConfirm: async () => {
        setActionLoading(userId); setConfirmModal(null)
        try {
          await admin.rejectUser(userId)
          setPendingUsers(prev => prev.filter(u => u.id !== userId))
          setStats(prev => prev ? { ...prev, pending_users: prev.pending_users - 1 } : null)
        } catch (err) { alert('Failed to reject') }
        finally { setActionLoading(null) }
      }
    })
  }

  const handleDeletePost = async (postId) => {
    setConfirmModal({
      title: 'Delete Post', type: 'danger',
      message: 'Delete this post permanently?',
      onConfirm: async () => {
        setActionLoading(postId); setConfirmModal(null)
        try {
          await admin.deletePost(postId)
          setPosts(prev => prev.filter(p => p.id !== postId))
          setStats(prev => prev ? { ...prev, total_posts: prev.total_posts - 1 } : null)
        } catch (err) { alert('Failed to delete post') }
        finally { setActionLoading(null) }
      }
    })
  }

  const handleDeleteStory = async (storyId) => {
    setConfirmModal({
      title: 'Delete Story', type: 'danger',
      message: 'Delete this story permanently?',
      onConfirm: async () => {
        setActionLoading(storyId); setConfirmModal(null)
        try {
          await admin.deleteStory(storyId)
          setStories(prev => prev.filter(s => s.id !== storyId))
          setStats(prev => prev ? { ...prev, total_stories: prev.total_stories - 1 } : null)
        } catch (err) { alert('Failed to delete story') }
        finally { setActionLoading(null) }
      }
    })
  }

  const handleBan = async (userId, userName) => {
    setConfirmModal({
      title: 'Ban User', type: 'warning',
      message: `Ban "${userName}"? They will be unable to access the app.`,
      onConfirm: async () => {
        setActionLoading(userId); setConfirmModal(null)
        try {
          await admin.banUser(userId)
          setAllUsers(prev => prev.map(u => u.id === userId ? { ...u, is_banned: true } : u))
          setStats(prev => prev ? { ...prev, banned_users: prev.banned_users + 1 } : null)
        } catch (err) { alert(err.response?.data?.message || 'Failed to ban') }
        finally { setActionLoading(null) }
      }
    })
  }

  const handleUnban = async (userId) => {
    setActionLoading(userId)
    try {
      await admin.unbanUser(userId)
      setAllUsers(prev => prev.map(u => u.id === userId ? { ...u, is_banned: false } : u))
      setStats(prev => prev ? { ...prev, banned_users: prev.banned_users - 1 } : null)
    } catch (err) { alert('Failed to unban') }
    finally { setActionLoading(null) }
  }

  const handleDeleteUser = async (userId, userName) => {
    setConfirmModal({
      title: 'Delete User Permanently', type: 'danger',
      message: `PERMANENTLY delete "${userName}"? All their data will be removed.`,
      onConfirm: async () => {
        setActionLoading(userId); setConfirmModal(null)
        try {
          await admin.deleteUser(userId)
          setAllUsers(prev => prev.filter(u => u.id !== userId))
          setStats(prev => prev ? { ...prev, total_users: prev.total_users - 1 } : null)
        } catch (err) { alert(err.response?.data?.message || 'Failed to delete') }
        finally { setActionLoading(null) }
      }
    })
  }

  const handleReviewReport = async (reportId, status, action = 'none') => {
    setActionLoading(reportId)
    try {
      await admin.reviewReport(reportId, { status, action })
      setReports(prev => prev.filter(r => r.id !== reportId))
      if (status === 'resolved' || status === 'dismissed')
        setStats(prev => prev ? { ...prev, pending_reports: Math.max(0, prev.pending_reports - 1) } : null)
    } catch (err) { alert('Failed to review report') }
    finally { setActionLoading(null) }
  }

  const handleLogout = async () => {
    await logout()
    navigate('/admin/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Loader2 size={40} className="animate-spin" style={{ color: '#5DADE2' }} />
      </div>
    )
  }

  const tabs = [
    { id: 'verification', label: 'Verify', icon: UserCheck, badge: stats?.pending_users },
    { id: 'content', label: 'Content', icon: Image, badge: null },
    { id: 'users', label: 'Users', icon: Users, badge: null },
    { id: 'reports', label: 'Reports', icon: Flag, badge: stats?.pending_reports },
  ]

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-3 sm:px-4">
          <div className="h-14 sm:h-16 flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#5DADE2' }}>
                <Shield size={18} className="sm:hidden text-white" />
                <Shield size={22} className="hidden sm:block text-white" />
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-bold text-white">Admin</h1>
                <p className="text-[10px] sm:text-xs text-gray-500 hidden sm:block">WolloDate Management</p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              <button onClick={loadInitialData} className="p-1.5 sm:p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition" title="Refresh">
                <RefreshCw size={16} className="sm:w-4.5 sm:h-4.5" />
              </button>
              <div className="hidden sm:flex items-center gap-2 text-sm">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span className="text-gray-300">{adminUser?.name}</span>
              </div>
              <button onClick={handleLogout} className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition text-sm" title="Logout">
                <LogOut size={16} /><span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Stats Bar */}
      <div className="bg-gray-900/50 border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 sm:gap-3">
            <StatCard icon={<Clock size={16} />} label="Pending" value={stats?.pending_users || 0} color="yellow" />
            <StatCard icon={<Users size={16} />} label="Users" value={stats?.total_users || 0} color="blue" />
            <StatCard icon={<Ban size={16} />} label="Banned" value={stats?.banned_users || 0} color="red" />
            <StatCard icon={<Flag size={16} />} label="Reports" value={stats?.pending_reports || 0} color="orange" />
            <StatCard icon={<FileText size={16} />} label="Posts" value={stats?.total_posts || 0} color="purple" className="hidden sm:block" />
            <StatCard icon={<Film size={16} />} label="Stories" value={stats?.total_stories || 0} color="green" className="hidden sm:block" />
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-gray-900/30 border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-3 sm:px-4">
          <div className="flex">
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex-1 sm:flex-none px-2 sm:px-5 py-3 sm:py-4 text-xs sm:text-sm font-medium border-b-2 transition flex items-center justify-center sm:justify-start gap-1 sm:gap-2 ${
                  activeTab === tab.id ? 'border-transparent text-gray-400 hover:text-white' : 'border-transparent text-gray-400 hover:text-white'
                }`}
                style={activeTab === tab.id ? { borderBottomColor: '#5DADE2', color: '#5DADE2' } : {}}
              >
                <tab.icon size={16} className="sm:w-4.5 sm:h-4.5" />
                <span>{tab.label}</span>
                {tab.badge > 0 && <span className="bg-red-500 text-white text-[10px] sm:text-xs font-bold px-1.5 py-0.5 rounded-full min-w-4 text-center">{tab.badge}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {activeTab === 'verification' && <VerificationTab pendingUsers={pendingUsers} actionLoading={actionLoading} onApprove={handleApprove} onReject={handleReject} onViewImage={setSelectedImage} />}
        {activeTab === 'content' && <ContentTab posts={posts} stories={stories} loading={contentLoading} pagination={contentPagination} contentType={contentType} searchQuery={contentSearch} actionLoading={actionLoading} onTypeChange={setContentType} onSearchChange={setContentSearch} onPageChange={(p) => loadContent(p)} onDeletePost={handleDeletePost} onDeleteStory={handleDeleteStory} />}
        {activeTab === 'users' && <UsersTab users={allUsers} loading={usersLoading} pagination={usersPagination} searchQuery={userSearch} showBanned={showBanned} actionLoading={actionLoading} onSearchChange={setUserSearch} onShowBannedChange={setShowBanned} onPageChange={(p) => loadUsers(p)} onBan={handleBan} onUnban={handleUnban} onDelete={handleDeleteUser} />}
        {activeTab === 'reports' && <ReportsTab reports={reports} loading={reportsLoading} pagination={reportsPagination} status={reportStatus} actionLoading={actionLoading} onStatusChange={setReportStatus} onPageChange={(p) => loadReports(p)} onReview={handleReviewReport} />}
      </main>

      {/* Image Modal */}
      {selectedImage && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4" onClick={() => setSelectedImage(null)}>
          <div className="max-w-3xl max-h-[85vh] relative">
            <img src={selectedImage} alt="Preview" className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl" />
            <button onClick={() => setSelectedImage(null)} className="absolute -top-4 -right-4 bg-gray-800 text-white p-2 rounded-full hover:bg-gray-700 shadow-lg"><XCircle size={24} /></button>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl">
            <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center mb-3 sm:mb-4 ${confirmModal.type === 'danger' ? 'bg-red-500/20' : 'bg-yellow-500/20'}`}>
              <AlertTriangle size={20} className={`sm:hidden ${confirmModal.type === 'danger' ? 'text-red-500' : 'text-yellow-500'}`} />
              <AlertTriangle size={24} className={`hidden sm:block ${confirmModal.type === 'danger' ? 'text-red-500' : 'text-yellow-500'}`} />
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-white mb-2">{confirmModal.title}</h3>
            <p className="text-sm sm:text-base text-gray-400 mb-5 sm:mb-6">{confirmModal.message}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmModal(null)} className="flex-1 px-4 py-3 sm:py-2.5 bg-gray-800 text-white rounded-xl sm:rounded-lg hover:bg-gray-700 transition font-medium">Cancel</button>
              <button onClick={confirmModal.onConfirm} className={`flex-1 px-4 py-3 sm:py-2.5 rounded-xl sm:rounded-lg text-white font-medium transition ${confirmModal.type === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-yellow-600 hover:bg-yellow-700'}`}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Stats Card
function StatCard({ icon, label, value, color, className = '' }) {
  const colors = { yellow: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30', blue: 'text-blue-500 bg-blue-500/10 border-blue-500/30', red: 'text-red-500 bg-red-500/10 border-red-500/30', green: 'text-green-500 bg-green-500/10 border-green-500/30', purple: 'text-purple-500 bg-purple-500/10 border-purple-500/30', orange: 'text-orange-500 bg-orange-500/10 border-orange-500/30' }
  return (
    <div className={`rounded-lg sm:rounded-xl p-2 sm:p-3 border ${colors[color]} ${className}`}>
      <div className="flex items-center justify-between"><span className="text-[10px] sm:text-xs text-gray-400 truncate">{label}</span><span className="hidden sm:block">{icon}</span></div>
      <p className="text-lg sm:text-2xl font-bold text-white mt-0.5 sm:mt-1">{value}</p>
    </div>
  )
}

// Verification Tab
function VerificationTab({ pendingUsers, actionLoading, onApprove, onReject, onViewImage }) {
  if (pendingUsers.length === 0) {
    return (
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl sm:rounded-2xl p-8 sm:p-12 text-center">
        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-3 sm:mb-4"><CheckCircle size={28} className="sm:hidden text-green-500" /><CheckCircle size={32} className="hidden sm:block text-green-500" /></div>
        <h3 className="text-lg sm:text-xl font-semibold text-white mb-2">All Caught Up!</h3>
        <p className="text-sm sm:text-base text-gray-400">No pending verifications at the moment.</p>
      </div>
    )
  }
  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-center justify-between mb-1 sm:mb-2"><h2 className="text-base sm:text-lg font-semibold text-white">Pending Verifications</h2><span className="text-xs sm:text-sm text-gray-400">{pendingUsers.length} waiting</span></div>
      <div className="grid gap-3 sm:gap-4">
        {pendingUsers.map(user => (
          <div key={user.id} className="bg-gray-900/80 border border-gray-800 rounded-xl p-3 sm:p-4 hover:border-gray-700 transition">
            <div className="flex flex-col gap-3 sm:gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <img src={getAvatarUrl(user)} alt={user.name} className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover shrink-0" />
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-white text-sm sm:text-base truncate">{user.name}</h3>
                  <p className="text-xs sm:text-sm text-gray-400 truncate">{user.email}</p>
                  <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1 flex items-center gap-1"><Clock size={10} className="sm:hidden" /><Clock size={12} className="hidden sm:block" />{new Date(user.created_at).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 w-full">
                {user.student_id_image && <button onClick={() => onViewImage(resolveMediaUrl(user.student_id_image))} className="flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-2 bg-gray-800 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white transition flex-1 sm:flex-none"><Eye size={16} /><span className="text-sm">ID</span></button>}
                <button onClick={() => onApprove(user.id)} disabled={actionLoading === user.id} className="flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-2 bg-green-600 hover:bg-green-700 rounded-lg text-white font-medium disabled:opacity-50 transition flex-1 text-sm">{actionLoading === user.id ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}<span>Approve</span></button>
                <button onClick={() => onReject(user.id)} disabled={actionLoading === user.id} className="flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white font-medium disabled:opacity-50 transition flex-1 text-sm"><XCircle size={16} /><span>Reject</span></button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Content Tab
function ContentTab({ posts, stories, loading, pagination, contentType, searchQuery, actionLoading, onTypeChange, onSearchChange, onPageChange, onDeletePost, onDeleteStory }) {
  const items = contentType === 'posts' ? posts : stories
  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
        <div className="flex gap-2">
          <button onClick={() => onTypeChange('posts')} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition font-medium text-sm ${contentType === 'posts' ? 'bg-purple-500/20 border-purple-500/50 text-purple-400' : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white'}`}><Image size={16} />Posts</button>
          <button onClick={() => onTypeChange('stories')} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition font-medium text-sm ${contentType === 'stories' ? 'bg-green-500/20 border-green-500/50 text-green-400' : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white'}`}><Film size={16} />Stories</button>
        </div>
        <div className="relative flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" /><input type="text" placeholder="Search content..." value={searchQuery} onChange={(e) => onSearchChange(e.target.value)} className="w-full pl-9 pr-4 py-2.5 bg-gray-900 border border-gray-800 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500" /></div>
      </div>
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 sm:p-12 text-center"><Loader2 size={28} className="text-purple-500 animate-spin mx-auto" /></div>
        ) : items.length === 0 ? (
          <div className="p-8 sm:p-12 text-center"><Image size={32} className="text-gray-600 mx-auto mb-3" /><p className="text-sm sm:text-base text-gray-400">No {contentType} found</p></div>
        ) : (
          <>
            <div className="divide-y divide-gray-800">
              {items.map(item => (
                <div key={item.id} className="p-3 sm:p-4 hover:bg-gray-800/50 transition">
                  <div className="flex items-start gap-3">
                    {contentType === 'posts' && item.image_url && <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden bg-gray-800 shrink-0"><img src={resolveMediaUrl(item.image_url)} alt="" className="w-full h-full object-cover" /></div>}
                    {contentType === 'stories' && <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden bg-gray-800 shrink-0 flex items-center justify-center"><Film size={24} className="text-gray-500" /></div>}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1"><span className="font-medium text-white text-sm">{item.user?.name || 'Unknown'}</span><span className="text-xs text-gray-500">@{item.user?.username || 'unknown'}</span></div>
                      {contentType === 'posts' && item.caption && <p className="text-sm text-gray-400 line-clamp-2">{item.caption}</p>}
                      <p className="text-xs text-gray-500 mt-1">{new Date(item.created_at).toLocaleDateString()}</p>
                    </div>
                    <button onClick={() => contentType === 'posts' ? onDeletePost(item.id) : onDeleteStory(item.id)} disabled={actionLoading === item.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded-lg text-xs text-white disabled:opacity-50 transition shrink-0">{actionLoading === item.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}Delete</button>
                  </div>
                </div>
              ))}
            </div>
            <Pagination pagination={pagination} onPageChange={onPageChange} />
          </>
        )}
      </div>
    </div>
  )
}

// Users Tab
function UsersTab({ users, loading, pagination, searchQuery, showBanned, actionLoading, onSearchChange, onShowBannedChange, onPageChange, onBan, onUnban, onDelete }) {
  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
        <div className="relative flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" /><input type="text" placeholder="Search users..." value={searchQuery} onChange={(e) => onSearchChange(e.target.value)} className="w-full pl-9 pr-4 py-2.5 bg-gray-900 border border-gray-800 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" /></div>
        <button onClick={() => onShowBannedChange(!showBanned)} className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border transition font-medium text-sm ${showBanned ? 'bg-red-500/20 border-red-500/50 text-red-400' : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white'}`}><Ban size={16} /><span>{showBanned ? 'Showing Banned' : 'Show Banned'}</span></button>
      </div>
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 sm:p-12 text-center"><Loader2 size={28} className="text-blue-500 animate-spin mx-auto" /></div>
        ) : users.length === 0 ? (
          <div className="p-8 sm:p-12 text-center"><UserX size={32} className="text-gray-600 mx-auto mb-3" /><p className="text-sm sm:text-base text-gray-400">No users found</p></div>
        ) : (
          <>
            <div className="divide-y divide-gray-800">
              {users.map(user => (
                <div key={user.id} className="p-3 sm:p-4 hover:bg-gray-800/50 transition">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <img src={getAvatarUrl(user)} alt={user.name} className="w-10 h-10 rounded-full object-cover" />
                        {user.is_online && <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-gray-900"></div>}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2"><span className="font-medium text-white text-sm truncate">{user.name}</span>{user.is_banned && <span className="flex items-center gap-1 text-xs text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded"><Ban size={10} />Banned</span>}</div>
                        <p className="text-xs text-gray-500 truncate">{user.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {user.is_banned ? (
                        <button onClick={() => onUnban(user.id)} disabled={actionLoading === user.id} className="flex items-center gap-1 px-2.5 py-1.5 bg-green-600 hover:bg-green-700 rounded-lg text-xs text-white disabled:opacity-50 transition">{actionLoading === user.id ? <Loader2 size={12} className="animate-spin" /> : <ShieldOff size={12} />}Unban</button>
                      ) : (
                        <button onClick={() => onBan(user.id, user.name)} disabled={actionLoading === user.id} className="flex items-center gap-1 px-2.5 py-1.5 bg-yellow-600 hover:bg-yellow-700 rounded-lg text-xs text-white disabled:opacity-50 transition"><Ban size={12} />Ban</button>
                      )}
                      <button onClick={() => onDelete(user.id, user.name)} disabled={actionLoading === user.id} className="flex items-center gap-1 px-2.5 py-1.5 bg-red-600 hover:bg-red-700 rounded-lg text-xs text-white disabled:opacity-50 transition"><Trash2 size={12} />Delete</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <Pagination pagination={pagination} onPageChange={onPageChange} />
          </>
        )}
      </div>
    </div>
  )
}

// Reports Tab
function ReportsTab({ reports, loading, pagination, status, actionLoading, onStatusChange, onPageChange, onReview }) {
  const reasonLabels = { spam: 'Spam', harassment: 'Harassment', inappropriate_content: 'Inappropriate', hate_speech: 'Hate Speech', violence: 'Violence', fake_account: 'Fake Account', other: 'Other' }
  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-2">
        {['pending', 'reviewed', 'resolved', 'dismissed'].map(s => (
          <button key={s} onClick={() => onStatusChange(s)} className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition font-medium text-sm whitespace-nowrap ${status === s ? 'bg-orange-500/20 border-orange-500/50 text-orange-400' : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white'}`}>{s.charAt(0).toUpperCase() + s.slice(1)}</button>
        ))}
      </div>
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 sm:p-12 text-center"><Loader2 size={28} className="text-orange-500 animate-spin mx-auto" /></div>
        ) : reports.length === 0 ? (
          <div className="p-8 sm:p-12 text-center"><Flag size={32} className="text-gray-600 mx-auto mb-3" /><p className="text-sm sm:text-base text-gray-400">No {status} reports</p></div>
        ) : (
          <>
            <div className="divide-y divide-gray-800">
              {reports.map(report => (
                <div key={report.id} className="p-3 sm:p-4 hover:bg-gray-800/50 transition">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded ${report.content?.type === 'post' ? 'bg-purple-500/20 text-purple-400' : report.content?.type === 'comment' ? 'bg-blue-500/20 text-blue-400' : report.content?.type === 'story' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>{report.content?.type || 'Unknown'}</span>
                          <span className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-400">{reasonLabels[report.reason] || report.reason}</span>
                        </div>
                        <p className="text-sm text-white">Reported by <span className="text-gray-400">@{report.reporter?.username || 'unknown'}</span></p>
                        <p className="text-xs text-gray-500 mt-1">{new Date(report.created_at).toLocaleString()}</p>
                      </div>
                    </div>
                    {report.content && (
                      <div className="bg-gray-800/50 rounded-lg p-3">
                        {report.content.type === 'post' && <><p className="text-xs text-gray-500 mb-1">Post by @{report.content.user?.username}</p><p className="text-sm text-gray-300 line-clamp-2">{report.content.caption || 'No caption'}</p></>}
                        {report.content.type === 'comment' && <><p className="text-xs text-gray-500 mb-1">Comment by @{report.content.user?.username}</p><p className="text-sm text-gray-300 line-clamp-2">{report.content.body}</p></>}
                        {report.content.type === 'story' && <><p className="text-xs text-gray-500 mb-1">Story by @{report.content.user?.username}</p><p className="text-sm text-gray-400">Media type: {report.content.media_type}</p></>}
                        {report.content.type === 'user' && <><p className="text-xs text-gray-500 mb-1">User Account</p><p className="text-sm text-gray-300">@{report.content.username} ({report.content.name})</p></>}
                      </div>
                    )}
                    {report.description && <p className="text-sm text-gray-400 italic">"{report.description}"</p>}
                    {status === 'pending' && (
                      <div className="flex items-center gap-2 pt-2">
                        <button onClick={() => onReview(report.id, 'resolved', 'delete_content')} disabled={actionLoading === report.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded-lg text-xs text-white disabled:opacity-50 transition">{actionLoading === report.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}Delete Content</button>
                        <button onClick={() => onReview(report.id, 'resolved', 'ban_user')} disabled={actionLoading === report.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 rounded-lg text-xs text-white disabled:opacity-50 transition"><Ban size={12} />Ban User</button>
                        <button onClick={() => onReview(report.id, 'dismissed', 'none')} disabled={actionLoading === report.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs text-white disabled:opacity-50 transition"><XCircle size={12} />Dismiss</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <Pagination pagination={pagination} onPageChange={onPageChange} />
          </>
        )}
      </div>
    </div>
  )
}

// Pagination
function Pagination({ pagination, onPageChange }) {
  if (pagination.last_page <= 1) return null
  return (
    <div className="flex items-center justify-between px-3 sm:px-4 py-3 border-t border-gray-800 bg-gray-900">
      <span className="text-xs sm:text-sm text-gray-400"><span className="sm:hidden">{pagination.current_page}/{pagination.last_page}</span><span className="hidden sm:inline">Page {pagination.current_page} of {pagination.last_page} ({pagination.total} items)</span></span>
      <div className="flex items-center gap-2">
        <button onClick={() => onPageChange(pagination.current_page - 1)} disabled={pagination.current_page === 1} className="p-2 rounded-lg bg-gray-800 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition"><ChevronLeft size={18} /></button>
        <button onClick={() => onPageChange(pagination.current_page + 1)} disabled={pagination.current_page === pagination.last_page} className="p-2 rounded-lg bg-gray-800 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition"><ChevronRight size={18} /></button>
      </div>
    </div>
  )
}
