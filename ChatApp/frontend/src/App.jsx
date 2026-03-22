import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { useAdminAuth } from './context/AdminAuthContext'
import Login from './pages/Login'
import Signup from './pages/Signup'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Chat from './pages/Chat'
import Profile from './pages/Profile'
import Search from './pages/Search'
import Feed from './pages/Feed'
import Notifications from './pages/Notifications'
import PostDetail from './pages/PostDetail'
import StoryDetail from './pages/StoryDetail'
import PendingVerification from './pages/PendingVerification'
import AdminLogin from './pages/AdminLogin'
import AdminDashboard from './pages/AdminDashboard'
import BottomNav from './components/BottomNav'
import GlobalAlertBridge from './components/GlobalAlertBridge'

function FullScreenLoader() {
  return <div className="h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-bg-base)' }}><div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--color-text-primary)' }}></div></div>
}

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  const hasToken = Boolean(localStorage.getItem('token'))
  if (loading) return <FullScreenLoader />
  return user && hasToken ? children : <Navigate to="/login" replace />
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth()
  const hasToken = Boolean(localStorage.getItem('token'))
  if (loading) return <FullScreenLoader />
  return !user || !hasToken ? children : <Navigate to="/" replace />
}

// Route that requires verified (approved) user
function VerifiedRoute({ children }) {
  const { user, loading } = useAuth()
  const hasToken = Boolean(localStorage.getItem('token'))
  if (loading) return <FullScreenLoader />
  if (!user || !hasToken) return <Navigate to="/login" replace />
  if (!user.is_approved) return <Navigate to="/pending" replace />
  return children
}

function AdminPrivateRoute({ children }) {
  const { admin, loading } = useAdminAuth()
  const hasAdminToken = Boolean(localStorage.getItem('adminToken'))
  if (loading) return <FullScreenLoader />
  return admin && hasAdminToken ? children : <Navigate to="/admin/login" replace />
}

function AdminPublicRoute({ children }) {
  const { admin, loading } = useAdminAuth()
  const hasAdminToken = Boolean(localStorage.getItem('adminToken'))
  if (loading) return <FullScreenLoader />
  return admin && hasAdminToken ? <Navigate to="/admin/dashboard" replace /> : children
}

export default function App() {
  const location = useLocation()
  const isAdminRoute = location.pathname.startsWith('/admin')
  const isAuthRoute = location.pathname === '/login' || location.pathname === '/signup' || location.pathname === '/forgot-password' || location.pathname === '/reset-password'
  const isChatRoute = location.pathname === '/chat' || location.pathname.startsWith('/c/')
  const useDesktopShell = !isAdminRoute && !isAuthRoute

  return (
    <>
      <div className={isAdminRoute || isChatRoute ? '' : 'pb-14 sm:pb-16 pb-[calc(3.5rem+env(safe-area-inset-bottom))] sm:pb-[calc(4rem+env(safe-area-inset-bottom))]'}>
        <div className={useDesktopShell ? 'desktop-app-shell' : ''}>
          <div className={useDesktopShell ? 'desktop-app-content' : ''}>
            <Routes>
              {/* User Auth Routes */}
              <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
              <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />
              <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
              <Route path="/reset-password" element={<PublicRoute><ResetPassword /></PublicRoute>} />
              <Route path="/pending" element={<PrivateRoute><PendingVerification /></PrivateRoute>} />
              
              {/* User App Routes */}
              <Route path="/" element={<VerifiedRoute><Feed /></VerifiedRoute>} />
              <Route path="/feed" element={<VerifiedRoute><Feed /></VerifiedRoute>} />
              <Route path="/chat" element={<VerifiedRoute><Chat /></VerifiedRoute>} />
              <Route path="/c/:conversationId" element={<VerifiedRoute><Chat /></VerifiedRoute>} />
              <Route path="/profile" element={<PrivateRoute><Profile /></PrivateRoute>} />
              <Route path="/profile/:userId" element={<VerifiedRoute><Profile /></VerifiedRoute>} />
              <Route path="/search" element={<VerifiedRoute><Search /></VerifiedRoute>} />
              <Route path="/notifications" element={<VerifiedRoute><Notifications /></VerifiedRoute>} />
              <Route path="/post/:postId" element={<VerifiedRoute><PostDetail /></VerifiedRoute>} />
              <Route path="/story/:storyId" element={<VerifiedRoute><StoryDetail /></VerifiedRoute>} />
              
              {/* Admin Routes - Separate from user auth */}
              <Route path="/admin/login" element={<AdminPublicRoute><AdminLogin /></AdminPublicRoute>} />
              <Route path="/admin/dashboard" element={<AdminPrivateRoute><AdminDashboard /></AdminPrivateRoute>} />
              <Route path="/admin" element={<Navigate to="/admin/login" />} />
              
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </div>
        </div>
      </div>
      {!isAdminRoute && <BottomNav />}
      <GlobalAlertBridge />
    </>
  )
}
