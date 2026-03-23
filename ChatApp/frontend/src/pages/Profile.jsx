import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../context/useSocket'
import { useTheme } from '../context/ThemeContext'
import { users, posts, follows } from '../api'
import VerifiedBadge from '../components/VerifiedBadge'
import CreatorBadge from '../components/CreatorBadge'
import ConfirmDialog from '../components/ConfirmDialog'
import { ProfileSkeleton } from '../components/Skeleton'
import { resolveMediaUrl } from '../utils/media'
import { getAvatarUrl } from '../utils/avatar'
import { readImageFileAsDataUrl } from '../utils/image'
import { isCreatorUser } from '../utils/creator'
import { 
  subscribeToPushNotifications, 
  unsubscribeFromPushNotifications,
  getNotificationPermission,
  isNotificationSupported 
} from '../utils/notifications'
import { 
  ArrowLeft, LogOut, Camera, Settings, Grid3X3, 
  Heart, MessageCircle, X, AlertCircle, CheckCircle, 
  UserPlus, Lock, Loader2, Sun, Moon, Bell
} from 'lucide-react'

export default function Profile() {
    // Modal for viewing profile photo
    const [showPhotoModal, setShowPhotoModal] = useState(false);
  const { userId } = useParams()
  const navigate = useNavigate()
  const { user, logout, refreshUser } = useAuth()
  const { emitFollowNotify } = useSocket()
  const { theme, toggleTheme } = useTheme()
  
  const isOwnProfile = !userId || userId === String(user?.id)
  const profileId = isOwnProfile ? user?.id : parseInt(userId)
  
  const [profile, setProfile] = useState(isOwnProfile ? user : null)
  const [userPosts, setUserPosts] = useState([])
  const [followers, setFollowers] = useState([])
  const [following, setFollowing] = useState([])
  const [followersCount, setFollowersCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingFollow, setLoadingFollow] = useState(false)
  const [loadingFollowers, setLoadingFollowers] = useState(false)
  const [loadingFollowing, setLoadingFollowing] = useState(false)
  const [isFollowing, setIsFollowing] = useState(false)
  const [isPendingFollow, setIsPendingFollow] = useState(false)
  
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  
  const [activeTab, setActiveTab] = useState('posts')
  const [showFollowersModal, setShowFollowersModal] = useState(false)
  const [showFollowingModal, setShowFollowingModal] = useState(false)
  const [notification, setNotification] = useState(null)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordErrors, setPasswordErrors] = useState({})
  const [blockedUsers, setBlockedUsers] = useState([])
  const [loadingBlockedUsers, setLoadingBlockedUsers] = useState(false)
  const [unblockingUserId, setUnblockingUserId] = useState(null)
  const [pendingUnblockUser, setPendingUnblockUser] = useState(null)
  const [settingsSection, setSettingsSection] = useState(null) // null = menu, 'profile', 'password', 'blocked'
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [loadingNotifications, setLoadingNotifications] = useState(false)
  
  // Image cropper state
  const [cropperImage, setCropperImage] = useState(null)
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 })
  const [cropScale, setCropScale] = useState(1)
  const dragRef = useRef(null)
  
  const fileInputRef = useRef(null)

  const showNotification = (type, message) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 4000)
  }

  useEffect(() => {
    // Reset cached followers/following when navigating to different profile
    setFollowers([])
    setFollowing([])
    loadProfile()
    checkNotificationStatus()
  }, [profileId])

  const checkNotificationStatus = () => {
    const status = getNotificationPermission()
    setNotificationsEnabled(status === 'granted')
  }

  const handleToggleNotifications = async () => {
    if (loadingNotifications) return

    setLoadingNotifications(true)
    try {
      if (notificationsEnabled) {
        await unsubscribeFromPushNotifications()
        setNotificationsEnabled(false)
        showNotification('success', 'Notifications disabled')
      } else {
        await subscribeToPushNotifications()
        setNotificationsEnabled(true)
        checkNotificationStatus()
        showNotification('success', 'Notifications enabled!')
      }
    } catch (error) {
      console.error('Error toggling notifications:', error)
      
      if (error.message?.includes('denied')) {
        showNotification('error', 'Notification permission denied. Enable in browser settings.')
      } else if (error.message?.includes('not supported')) {
        showNotification('error', 'Push notifications not supported in this browser.')
      } else {
        showNotification('error', 'Failed to toggle notifications.')
      }
    } finally {
      setLoadingNotifications(false)
    }
  }



  const loadProfile = async () => {
    try {
      setLoading(true)
      
      // Load profile data first
      const userRes = await users.get(profileId)
      const profileData = userRes.data.user
      setProfile(profileData)
      
      // Use counts from backend instead of fetching full arrays
      setFollowersCount(profileData.followers_count || 0)
      setFollowingCount(profileData.following_count || 0)
      
      if (isOwnProfile) {
        setName(profileData?.name || '')
        setUsername(profileData?.username || '')
        setBio(profileData?.bio || '')
        setIsPrivate(profileData?.is_private || false)
      } else {
        setIsFollowing(profileData.is_following || false)
        setIsPendingFollow(profileData.is_pending_follow || false)
      }
      
      // Load posts separately so a 403 doesn't break the profile
      try {
        const postsRes = await posts.getUserPosts(profileId)
        setUserPosts(postsRes.data.data || postsRes.data || [])
      } catch {
        setUserPosts([])
      }
      
    } catch (err) {
      console.error('Failed to load profile:', err)
      if (err.response?.status === 404) {
        navigate('/')
      }
    } finally {
      setLoading(false)
    }
  }

  // Lazy load followers only when modal is opened
  const loadFollowers = async () => {
    if (followers.length > 0) return // Already loaded
    try {
      setLoadingFollowers(true)
      const res = await follows.getFollowers(profileId)
      setFollowers(res.data.data || res.data || [])
    } catch (err) {
      console.error('Failed to load followers:', err)
    } finally {
      setLoadingFollowers(false)
    }
  }

  // Lazy load following only when modal is opened
  const loadFollowing = async () => {
    if (following.length > 0) return // Already loaded
    try {
      setLoadingFollowing(true)
      const res = await follows.getFollowing(profileId)
      setFollowing(res.data.data || res.data || [])
    } catch (err) {
      console.error('Failed to load following:', err)
    } finally {
      setLoadingFollowing(false)
    }
  }

  const handleFollow = async () => {
    try {
      setLoadingFollow(true)
      if (isFollowing || isPendingFollow) {
        await follows.unfollow(profileId)
        setIsFollowing(false)
        setIsPendingFollow(false)
        if (isFollowing) {
          setFollowersCount(prev => Math.max(0, prev - 1))
          setFollowers(followers.filter(f => f.id !== user.id))
        }
      } else {
        await follows.follow(profileId)
        emitFollowNotify(profileId)
        if (profile?.is_private) {
          setIsPendingFollow(true)
          showNotification('success', 'Follow request sent')
        } else {
          setIsFollowing(true)
          setFollowersCount(prev => prev + 1)
          setFollowers([...followers, user])
        }
      }
    } catch (err) {
      console.error('Failed to follow/unfollow:', err)
      showNotification('error', 'Failed to update follow status')
    } finally {
      setLoadingFollow(false)
    }
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await users.update(user.id, { name, username, bio, is_private: isPrivate })
      setProfile({ ...profile, name, username, bio, is_private: isPrivate })
      setEditing(false)
      showNotification('success', 'Profile updated')
      if (refreshUser) refreshUser()
    } catch (err) {
      console.error('Failed to save profile:', err)
      const errorMsg = err.response?.data?.errors?.username?.[0] || 'Failed to save changes'
      showNotification('error', errorMsg)
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setPasswordErrors({})
    setPasswordSaving(true)

    try {
      const payload = {
        current_password: currentPassword,
        password: newPassword,
        password_confirmation: confirmPassword,
      }

      await users.changePassword(user.id, payload)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setEditing(false)
      showNotification('success', 'Password changed. Please log in again.')
      await logout()
      navigate('/login')
    } catch (err) {
      const errors = err.response?.data?.errors || {}
      setPasswordErrors({
        current_password: errors.current_password?.[0] || '',
        password: errors.password?.[0] || '',
        password_confirmation: errors.password_confirmation?.[0] || '',
      })
      showNotification('error', Object.values(errors).flat()[0] || err.response?.data?.message || 'Failed to change password')
    } finally {
      setPasswordSaving(false)
    }
  }

  const loadBlockedUsers = async () => {
    if (!user?.id) return
    try {
      setLoadingBlockedUsers(true)
      const res = await users.getBlocked(user.id)
      setBlockedUsers(res.data?.blockedUsers || [])
    } catch (err) {
      console.error('Failed to load blocked users:', err)
      setBlockedUsers([])
    } finally {
      setLoadingBlockedUsers(false)
    }
  }

  const handleUnblockUser = async (blockedUser) => {
    if (!blockedUser?.id || unblockingUserId) return

    setPendingUnblockUser(blockedUser)
  }

  const confirmUnblockUser = async () => {
    const blockedUser = pendingUnblockUser
    if (!blockedUser?.id || unblockingUserId) return

    try {
      setUnblockingUserId(blockedUser.id)
      await users.unblock(blockedUser.id)
      setBlockedUsers((prev) => prev.filter((u) => u.id !== blockedUser.id))
      showNotification('success', 'User unblocked')
      setPendingUnblockUser(null)
    } catch (err) {
      console.error('Failed to unblock user:', err)
      showNotification('error', 'Failed to unblock user')
    } finally {
      setUnblockingUserId(null)
    }
  }

  const handleAvatarSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
      showNotification('error', 'Please upload a JPG, PNG, or WebP image')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      showNotification('error', 'Image must be less than 5MB')
      return
    }
    
    try {
      const imageUrl = await readImageFileAsDataUrl(file)
      setCropperImage({ url: imageUrl, file })
    } catch {
      setUploadingAvatar(true)
      try {
        const res = await users.uploadAvatar(user.id, file)
        setProfile({ ...profile, avatar_url: res.data.avatar_url, avatar: res.data.avatar })
        showNotification('success', 'Photo uploaded without crop preview')
        if (refreshUser) refreshUser()
      } catch (uploadErr) {
        const message = uploadErr.response?.data?.message || uploadErr.response?.data?.errors?.avatar?.[0] || 'Could not read this image file on your phone browser'
        showNotification('error', message)
      } finally {
        setUploadingAvatar(false)
      }
      return
    }

    setCropPosition({ x: 0, y: 0 })
    setCropScale(1)
  }

  const handleCropSave = async () => {
    if (!cropperImage) return
    
    setUploadingAvatar(true)
    try {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      const img = new Image()
      
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = cropperImage.url
      })
      
      const outputSize = 400
      canvas.width = outputSize
      canvas.height = outputSize
      
      // cropPosition is in px relative to the 288px preview circle
      const previewSize = 288
      const minDim = Math.min(img.width, img.height)
      const ratio = minDim / previewSize
      const scaledSize = minDim / cropScale
      const centerX = (img.width - scaledSize) / 2
      const centerY = (img.height - scaledSize) / 2
      const cropX = centerX - (cropPosition.x * ratio) / cropScale
      const cropY = centerY - (cropPosition.y * ratio) / cropScale
      
      // Draw cropped and scaled image
      ctx.drawImage(
        img,
        Math.max(0, cropX),
        Math.max(0, cropY),
        scaledSize,
        scaledSize,
        0,
        0,
        outputSize,
        outputSize
      )
      
      // Convert canvas to blob
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9))
      if (!blob) throw new Error('Failed to process image')
      const croppedFile = new File([blob], 'avatar.jpg', { type: 'image/jpeg' })
      
      const res = await users.uploadAvatar(user.id, croppedFile)
      setProfile({ ...profile, avatar_url: res.data.avatar_url, avatar: res.data.avatar })
      showNotification('success', 'Profile photo updated')
      if (refreshUser) refreshUser()
      
      setCropperImage(null)
    } catch (err) {
      console.error('Failed to upload avatar:', err)
      showNotification('error', 'Failed to upload photo')
    } finally {
      setUploadingAvatar(false)
    }
  }



  if (loading) {
    return (
      <div className="min-h-screen bg-black">
        <div className="fixed top-0 left-0 right-0 flex items-center justify-between p-3 sm:p-4 z-30">
          <button onClick={() => navigate('/')} className="p-1.5 sm:p-2 rounded-full bg-black/55 border border-gray-800">
            <ArrowLeft size={20} className="sm:w-[22px] sm:h-[22px] text-white" />
          </button>
        </div>
        <div className="max-w-xl mx-auto px-safe">
          <ProfileSkeleton />
          <div className="border-t border-b border-gray-800 flex">
            <div className="flex-1 py-2.5 sm:py-3 flex items-center justify-center gap-2 text-xs sm:text-sm font-semibold border-b-2 border-white">
              <Grid3X3 size={16} className="sm:w-[18px] sm:h-[18px]" />
              Posts
            </div>
          </div>
          <div className="grid grid-cols-3 gap-0.5 sm:gap-1 p-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="aspect-square bg-gray-800 animate-pulse rounded" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Toast Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 z-60 flex items-center gap-3 px-4 py-3 rounded-lg shadow-xl ${notification.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {notification.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          <span className="text-sm">{notification.message}</span>
          <button onClick={() => setNotification(null)}><X size={16} /></button>
        </div>
      )}

      <div className="fixed top-0 left-0 right-0 flex items-center justify-between p-3 sm:p-4 z-30 pointer-events-none">
        <button
          onClick={() => navigate('/')}
          className="p-1.5 sm:p-2 rounded-full bg-black/55 border border-gray-800 hover:bg-black/75 pointer-events-auto"
        >
          <ArrowLeft size={20} className="sm:w-[22px] sm:h-[22px] text-white" />
        </button>
        {isOwnProfile ? (
          <button
            onClick={() => {
              setEditing(true)
              setSettingsSection(null)
            }}
            className="p-1.5 sm:p-2 rounded-full bg-black/55 border border-gray-800 hover:bg-black/75 pointer-events-auto"
          >
            <Settings size={18} className="sm:w-5 sm:h-5 text-white" />
          </button>
        ) : (
          <div className="w-10" />
        )}
      </div>

      <div className="max-w-xl mx-auto px-safe">
        {/* Profile Header */}
        <div className="p-4 sm:p-6 pt-12 sm:pt-14 relative">
          <div className="flex items-start gap-4 sm:gap-6">
            {/* Avatar */}
            <div className="relative shrink-0">
              <img
                src={getAvatarUrl(profile)}
                alt={profile?.name}
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover border-2 border-gray-800 cursor-pointer shrink-0"
                onClick={() => { if (!isOwnProfile) setShowPhotoModal(true); }}
                style={{ pointerEvents: isOwnProfile ? 'none' : 'auto', aspectRatio: '1 / 1' }}
              />
              {isOwnProfile && (
                <>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingAvatar}
                    className="absolute bottom-0 right-0 text-white p-1.5 rounded-full transition"
                    style={{ backgroundColor: '#5DADE2' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#4A9FD5'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#5DADE2'}
                  >
                    {uploadingAvatar ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleAvatarSelect}
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                  />
                </>
              )}
              {/* Profile Photo Modal */}
              {showPhotoModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90" onClick={() => setShowPhotoModal(false)}>
                  <div className="absolute top-4 right-4">
                    <button onClick={() => setShowPhotoModal(false)} className="p-2 rounded-full bg-black/60 hover:bg-black/80">
                      <X className="w-7 h-7 text-white" />
                    </button>
                  </div>
                  <img
                    src={getAvatarUrl(profile)}
                    alt={profile?.name}
                    className="max-w-[90vw] max-h-[80vh] rounded-2xl object-contain border-2 border-gray-800 shadow-2xl"
                    onClick={e => e.stopPropagation()}
                  />
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 mb-0.5 min-w-0">
                <h1 className="text-base sm:text-lg md:text-xl font-semibold text-white truncate">{profile?.name}</h1>
                {profile?.is_approved ? <VerifiedBadge size="md" /> : <Lock size={16} className="text-yellow-500" title="Pending verification" />}
                {isCreatorUser(profile) && <CreatorBadge size="xxs" />}
              </div>
              {profile?.username && (
                <p className="text-gray-400 text-xs sm:text-sm mb-2 truncate">@{profile.username}</p>
              )}
              
              <div className="flex gap-4 sm:gap-6 text-xs sm:text-sm mb-3">
                <div className="text-center">
                  <span className="font-semibold text-white">{profile?.posts_count || userPosts.length}</span>
                  <span className="text-gray-400 ml-1">posts</span>
                </div>
                <button onClick={() => { setShowFollowersModal(true); loadFollowers(); }} className="text-center hover:opacity-70">
                  <span className="font-semibold text-white">{followersCount}</span>
                  <span className="text-gray-400 ml-1">followers</span>
                </button>
                <button onClick={() => { setShowFollowingModal(true); loadFollowing(); }} className="text-center hover:opacity-70">
                  <span className="font-semibold text-white">{followingCount}</span>
                  <span className="text-gray-400 ml-1">following</span>
                </button>
              </div>

              {/* Action Buttons */}
              {!isOwnProfile && (
                <div className="flex gap-2">
                  <button
                    onClick={handleFollow}
                    disabled={loadingFollow}
                    className={`flex-1 py-1.5 sm:py-2 px-3 sm:px-4 rounded-lg font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition ${
                      isFollowing 
                        ? 'bg-gray-800 text-white hover:bg-gray-700' 
                        : isPendingFollow
                        ? 'bg-gray-800 text-gray-400'
                        : 'text-white'
                    }`}
                    style={!isFollowing && !isPendingFollow ? { backgroundColor: '#5DADE2' } : {}}
                    onMouseEnter={(e) => { if (!isFollowing && !isPendingFollow) e.currentTarget.style.backgroundColor = '#4A9FD5' }}
                    onMouseLeave={(e) => { if (!isFollowing && !isPendingFollow) e.currentTarget.style.backgroundColor = '#5DADE2' }}
                  >
                    {loadingFollow ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : isFollowing ? (
                      <>Following</>
                    ) : isPendingFollow ? (
                      <>Requested</>
                    ) : (
                      <><UserPlus size={16} /> Follow</>
                    )}
                  </button>
                  <button
                    onClick={() => navigate('/chat', { state: { startChatUserId: profile?.id } })}
                    className="py-1.5 sm:py-2 px-3 sm:px-4 bg-gray-800 text-white rounded-lg font-semibold text-xs sm:text-sm hover:bg-gray-700 transition"
                  >
                    Message
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Bio */}
          {profile?.bio && (
            <p className="mt-3 sm:mt-4 text-xs sm:text-sm text-gray-300 whitespace-pre-wrap">{profile.bio}</p>
          )}
        </div>

        {/* Tabs */}
        <div className="border-t border-b border-gray-800 flex">
          <button
            onClick={() => setActiveTab('posts')}
            className={`flex-1 py-2.5 sm:py-3 flex items-center justify-center gap-2 text-xs sm:text-sm font-semibold border-b-2 transition ${
              activeTab === 'posts' ? 'border-white text-white' : 'border-transparent text-gray-500'
            }`}
          >
            <Grid3X3 size={16} className="sm:w-[18px] sm:h-[18px]" />
            Posts
          </button>
        </div>

        {/* Posts Grid */}
        {activeTab === 'posts' && (
          <div>
            {userPosts.length === 0 ? (
              <div className="py-12 sm:py-16 text-center">
                <Grid3X3 size={40} className="sm:w-12 sm:h-12 mx-auto text-gray-600 mb-4" />
                <p className="text-gray-500 text-sm">No posts yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-0.5 sm:gap-1">
                {userPosts.map((post) => (
                  (() => {
                    const mediaList = Array.isArray(post.media_urls) && post.media_urls.length > 0
                      ? post.media_urls
                      : (post.image_url ? [post.image_url] : [])

                    return (
                  <button
                    key={post.id}
                    onClick={() => navigate(`/post/${post.id}`)}
                    className="aspect-square relative group overflow-hidden bg-gray-900"
                  >
                    {mediaList.length > 0 ? (
                      (() => {
                        const url = resolveMediaUrl(mediaList[0]);
                        const isVideo = /\.(mp4|webm|ogg)$/i.test(url);
                        if (isVideo) {
                          return (
                            <video src={url} className="w-full h-full object-cover" controls={false} muted playsInline preload="metadata" />
                          );
                        } else {
                          return (
                            <img src={url} alt="" className="w-full h-full object-cover" />
                          );
                        }
                      })()
                    ) : (
                      <div className="w-full h-full flex items-center justify-center p-2 bg-gray-900">
                        <p className="text-xs text-gray-400 line-clamp-4">{post.caption}</p>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-4 text-white">
                      <span className="flex items-center gap-1">
                        <Heart size={18} fill="white" /> {post.likes_count || 0}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageCircle size={18} fill="white" /> {post.comments_count || 0}
                      </span>
                    </div>
                    {mediaList.length > 1 && (
                      <div className="absolute top-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-white font-semibold">
                        {mediaList.length} pics
                      </div>
                    )}
                  </button>
                    )
                  })()
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {/* Settings Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/80 z-60 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-gray-900 rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto border border-gray-800">
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <button 
                onClick={() => {
                  if (settingsSection) {
                    setSettingsSection(null)
                  } else {
                    setEditing(false)
                  }
                }}
                className="p-2 hover:bg-gray-800 rounded-full"
              >
                {settingsSection ? <ArrowLeft size={20} className="text-white" /> : <X size={20} className="text-white" />}
              </button>
              <h2 className="font-semibold text-lg text-white">
                {!settingsSection ? 'Settings' : settingsSection === 'profile' ? 'Edit Profile' : settingsSection === 'password' ? 'Change Password' : 'Blocked Users'}
              </h2>
              <div className="w-10" />
            </div>
            {/* Settings Menu */}
            {!settingsSection && (
              <div className="divide-y divide-gray-800">
                <button
                  onClick={() => setSettingsSection('profile')}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-800/50 transition text-left"
                >
                  <span className="text-white font-medium">Profile</span>
                  <ArrowLeft size={18} className="text-gray-400 rotate-180" />
                </button>
                
                <button
                  onClick={() => setSettingsSection('password')}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-800/50 transition text-left"
                >
                  <span className="text-white font-medium">Password</span>
                  <ArrowLeft size={18} className="text-gray-400 rotate-180" />
                </button>
                
                <button
                  onClick={() => {
                    setSettingsSection('blocked')
                    loadBlockedUsers()
                  }}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-800/50 transition text-left"
                >
                  <span className="text-white font-medium">Blocked Users</span>
                  <ArrowLeft size={18} className="text-gray-400 rotate-180" />
                </button>
                
                {isNotificationSupported() && (
                  <div className="p-4 border-b border-gray-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Bell size={18} className="text-gray-400" />
                        <div>
                          <p className="font-medium text-white text-sm">Push Notifications</p>
                          <p className="text-xs text-gray-400">Get notified about activity</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleToggleNotifications}
                        disabled={loadingNotifications}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          notificationsEnabled ? 'bg-blue-500' : 'bg-gray-700'
                        } ${loadingNotifications ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        {loadingNotifications ? (
                          <Loader2 size={14} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin" />
                        ) : (
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              notificationsEnabled ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        )}
                      </button>
                    </div>
                  </div>
                )}
                
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {theme === 'dark' ? <Moon size={18} className="text-gray-400" /> : <Sun size={18} className="text-gray-400" />}
                      <div>
                        <p className="font-medium text-white text-sm">Theme</p>
                        <p className="text-xs text-gray-400">{theme === 'dark' ? 'Dark mode' : 'Light mode'}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={toggleTheme}
                      className="w-12 h-6 rounded-full transition"
                      style={{ backgroundColor: theme === 'dark' ? '#5DADE2' : '#d1d5db' }}
                    >
                      <div 
                        className="w-5 h-5 bg-white rounded-full shadow transition-transform"
                        style={{ transform: theme === 'dark' ? 'translateX(1.5rem)' : 'translateX(0.125rem)' }}
                      />
                    </button>
                  </div>
                </div>
                
                <button
                  onClick={async () => { await logout(); navigate('/login') }}
                  className="w-full py-4 text-red-500 font-semibold flex items-center justify-center gap-2 hover:bg-red-900/20 transition"
                >
                  <LogOut size={18} /> Log Out
                </button>
              </div>
            )}

            {/* Profile Edit Section */}
            {settingsSection === 'profile' && (
              <form onSubmit={handleSave} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Username</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">@</span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    className="w-full pl-8 pr-3 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="username"
                    minLength={3}
                    maxLength={30}
                    required
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">Only letters, numbers, and underscores</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Bio</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  placeholder="Tell people about yourself..."
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-white">Private Account</p>
                  <p className="text-sm text-gray-400">Only approved followers can see your posts</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPrivate(!isPrivate)}
                  className="w-12 h-6 rounded-full transition"
                  style={{ backgroundColor: isPrivate ? '#5DADE2' : '#374151' }}
                >
                  <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${isPrivate ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
              </div>
              <button
                type="submit"
                disabled={saving}
                className="w-full py-3 text-white font-semibold rounded-lg disabled:opacity-50 flex items-center justify-center transition"
                style={{ backgroundColor: '#5DADE2' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#4A9FD5'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#5DADE2'}
              >
                {saving ? <Loader2 className="animate-spin" /> : 'Save Changes'}
              </button>
              </form>
            )}

            {/* Password Change Section */}
            {settingsSection === 'password' && (
              <form onSubmit={handleChangePassword} className="p-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Current password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:border-transparent"
                  style={{ '--tw-ring-color': '#5DADE2' }}
                  required
                />
                {passwordErrors.current_password && <p className="text-red-400 text-xs mt-1">{passwordErrors.current_password}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">New password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:border-transparent"
                  style={{ '--tw-ring-color': '#5DADE2' }}
                  required
                />
                {passwordErrors.password && <p className="text-red-400 text-xs mt-1">{passwordErrors.password}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Confirm new password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:border-transparent"
                  style={{ '--tw-ring-color': '#5DADE2' }}
                  required
                />
                {passwordErrors.password_confirmation && <p className="text-red-400 text-xs mt-1">{passwordErrors.password_confirmation}</p>}
              </div>
              <button
                type="submit"
                disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}
                className="w-full py-3 text-white font-semibold rounded-lg disabled:opacity-50 flex items-center justify-center transition"
                style={{ backgroundColor: '#5DADE2' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#4A9FD5'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#5DADE2'}
              >
                {passwordSaving ? <Loader2 className="animate-spin" /> : 'Update Password'}
              </button>
              </form>
            )}

            {/* Blocked Users Section */}
            {settingsSection === 'blocked' && (
              <div className="p-4">
              {loadingBlockedUsers ? (
                <div className="py-8 flex justify-center">
                  <Loader2 className="animate-spin text-gray-400" size={24} />
                </div>
              ) : blockedUsers.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">You have not blocked anyone.</p>
              ) : (
                <div className="space-y-2">
                  {blockedUsers.map((blockedUser) => (
                    <div key={blockedUser.id} className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900 px-3 py-2">
                      <button
                        type="button"
                        onClick={() => { setEditing(false); navigate(`/profile/${blockedUser.id}`) }}
                        className="flex items-center gap-3 min-w-0"
                      >
                        <img src={getAvatarUrl(blockedUser)} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" style={{ aspectRatio: '1 / 1' }} />
                        <div className="text-left min-w-0">
                          <p className="text-sm text-white truncate">{blockedUser.name}</p>
                          <p className="text-xs text-gray-500 truncate">{blockedUser.email}</p>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUnblockUser(blockedUser)}
                        disabled={unblockingUserId === blockedUser.id}
                        className="px-3 py-1.5 rounded-lg bg-gray-700 text-white text-sm hover:bg-gray-600 disabled:opacity-50"
                      >
                        {unblockingUserId === blockedUser.id ? 'Unblocking...' : 'Unblock'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Followers Modal */}
      {showFollowersModal && (
        <div className="fixed inset-0 bg-black/80 z-60 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-xl w-full max-w-md max-h-[70vh] overflow-hidden border border-gray-800">
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <h2 className="font-semibold text-white">Followers</h2>
              <button onClick={() => setShowFollowersModal(false)} className="p-2 hover:bg-gray-800 rounded-full">
                <X size={20} className="text-white" />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[calc(70vh-60px)]">
              {loadingFollowers ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="animate-spin text-gray-400" size={24} />
                </div>
              ) : followers.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No followers yet</p>
              ) : (
                followers.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => { setShowFollowersModal(false); navigate(`/profile/${f.id}`) }}
                    className="w-full flex items-center gap-3 p-3 hover:bg-gray-800 transition"
                  >
                    <img src={getAvatarUrl(f)} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" style={{ aspectRatio: '1 / 1' }} />
                    <div className="flex-1 text-left">
                      <p className="font-semibold text-sm text-white flex items-center gap-1">
                        {f.name} {f.is_approved && <VerifiedBadge size="xs" />}
                        {isCreatorUser(f) && <CreatorBadge size="xs" />}
                      </p>
                      <p className="text-xs text-gray-500">@{f.username || 'unknown'}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Following Modal */}
      {showFollowingModal && (
        <div className="fixed inset-0 bg-black/80 z-60 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-xl w-full max-w-md max-h-[70vh] overflow-hidden border border-gray-800">
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <h2 className="font-semibold text-white">Following</h2>
              <button onClick={() => setShowFollowingModal(false)} className="p-2 hover:bg-gray-800 rounded-full">
                <X size={20} className="text-white" />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[calc(70vh-60px)]">
              {loadingFollowing ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="animate-spin text-gray-400" size={24} />
                </div>
              ) : following.length === 0 ? (
                <p className="text-center text-gray-500 py-8">Not following anyone yet</p>
              ) : (
                following.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => { setShowFollowingModal(false); navigate(`/profile/${f.id}`) }}
                    className="w-full flex items-center gap-3 p-3 hover:bg-gray-800 transition"
                  >
                    <img src={getAvatarUrl(f)} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" style={{ aspectRatio: '1 / 1' }} />
                    <div className="flex-1 text-left">
                      <p className="font-semibold text-sm text-white flex items-center gap-1">
                        {f.name} {f.is_approved && <VerifiedBadge size="xs" />}
                        {isCreatorUser(f) && <CreatorBadge size="xs" />}
                      </p>
                      <p className="text-xs text-gray-500">@{f.username || 'unknown'}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Image Cropper Modal */}
      {cropperImage && (
        <div className="fixed inset-0 bg-black/85 z-60 flex items-end md:items-center justify-center md:p-6 overflow-y-auto">
          <div className="w-full h-full md:h-auto md:max-h-[92vh] md:max-w-2xl bg-black md:bg-gray-950 md:border md:border-gray-800 md:rounded-2xl flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-gray-800 shrink-0">
            <button 
              onClick={() => {
                setCropperImage(null)
              }}
              className="text-white hover:text-gray-300"
            >
              Cancel
            </button>
            <h2 className="font-semibold text-white">Adjust Photo</h2>
            <button 
              onClick={handleCropSave}
              disabled={uploadingAvatar}
              className="font-semibold disabled:opacity-50"
              style={{ color: '#5DADE2' }}
            >
              {uploadingAvatar ? 'Saving...' : 'Done'}
            </button>
          </div>
          
          <div
            className="flex-1 min-h-0 flex items-center justify-center p-4 overflow-hidden touch-none"
            onMouseDown={(e) => { dragRef.current = { startX: e.clientX - cropPosition.x, startY: e.clientY - cropPosition.y } }}
            onMouseMove={(e) => { if (!dragRef.current) return; setCropPosition({ x: e.clientX - dragRef.current.startX, y: e.clientY - dragRef.current.startY }) }}
            onMouseUp={() => { dragRef.current = null }}
            onMouseLeave={() => { dragRef.current = null }}
            onTouchStart={(e) => { const t = e.touches[0]; dragRef.current = { startX: t.clientX - cropPosition.x, startY: t.clientY - cropPosition.y } }}
            onTouchMove={(e) => { if (!dragRef.current) return; const t = e.touches[0]; setCropPosition({ x: t.clientX - dragRef.current.startX, y: t.clientY - dragRef.current.startY }) }}
            onTouchEnd={() => { dragRef.current = null }}
            onWheel={(e) => { e.preventDefault(); setCropScale(s => Math.min(3, Math.max(1, s + (e.deltaY > 0 ? -0.1 : 0.1)))) }}
          >
            <div className="relative w-64 h-64 md:w-72 md:h-72 rounded-full overflow-hidden border-2 border-white/30">
              <img
                src={cropperImage.url}
                alt="Crop preview"
                onError={() => showNotification('error', 'This photo format is not supported on your phone browser')}
                className="absolute w-full h-full object-cover"
                style={{
                  transform: `translate(${cropPosition.x}px, ${cropPosition.y}px) scale(${cropScale})`,
                }}
                draggable={false}
              />
            </div>
          </div>
          
          <div className="p-4 border-t border-gray-800 shrink-0">
            <label className="text-sm text-gray-400 mb-2 block text-center">Zoom</label>
            <input
              type="range"
              min="1"
              max="3"
              step="0.1"
              value={cropScale}
              onChange={(e) => setCropScale(parseFloat(e.target.value))}
              className="w-full accent-blue-500"
            />
            <p className="text-xs text-gray-500 text-center mt-2">Drag to reposition • Scroll or slide to zoom</p>
          </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingUnblockUser)}
        title={`Unblock ${pendingUnblockUser?.name || 'this user'}?`}
        message="They will be able to message and interact with you again."
        confirmLabel="Unblock"
        tone="neutral"
        loading={Boolean(unblockingUserId)}
        onClose={() => {
          if (!unblockingUserId) setPendingUnblockUser(null)
        }}
        onConfirm={confirmUnblockUser}
      />
    </div>
  )
}
