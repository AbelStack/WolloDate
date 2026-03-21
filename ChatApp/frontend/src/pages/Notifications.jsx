import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSocket } from '../context/useSocket'
import { follows, notifications } from '../api'
import { ArrowLeft, Bell, Loader2 } from 'lucide-react'
import VerifiedBadge from '../components/VerifiedBadge'
import { getAvatarUrl } from '../utils/avatar'

export default function Notifications() {
  const navigate = useNavigate()
  const { clearAlertBadge, emitFollowNotify, refreshNotificationCounts } = useSocket()
  
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState({})
  const [followingBack, setFollowingBack] = useState({})

  useEffect(() => {
    clearAlertBadge()
    loadActivity()
  }, [])

  const loadActivity = async () => {
    try {
      setLoading(true)
      const res = await follows.getActivity()
      const data = res.data
      setActivity(data.activity || [])

      await notifications.markMentionsRead().catch(() => null)
      refreshNotificationCounts()

      // Track follow-back state locally
      const fbState = {}
      ;(data.activity || []).forEach(item => {
        if (item.type === 'follow') {
          fbState[item.follower?.id] = item.is_following_back
        }
      })
      setFollowingBack(fbState)
    } catch (err) {
      console.error('Failed to load activity:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleFollowRequest = async (followId, action) => {
    try {
      setProcessing(prev => ({ ...prev, [followId]: true }))
      await follows.respondToRequest(followId, { action })
      // Update status locally instead of removing
      setActivity(prev => prev.map(item => 
        item.id === followId 
          ? { ...item, status: action === 'accept' ? 'accepted' : 'rejected' }
          : item
      ).filter(item => item.status !== 'rejected'))
    } catch (err) {
      console.error('Failed to respond to request:', err)
    } finally {
      setProcessing(prev => ({ ...prev, [followId]: false }))
    }
  }

  const handleFollowBack = async (userId) => {
    try {
      setProcessing(prev => ({ ...prev, [`fb-${userId}`]: true }))
      await follows.follow(userId)
      emitFollowNotify(userId)
      setFollowingBack(prev => ({ ...prev, [userId]: true }))
    } catch (err) {
      console.error('Failed to follow back:', err)
    } finally {
      setProcessing(prev => ({ ...prev, [`fb-${userId}`]: false }))
    }
  }

  const handleUnfollow = async (userId) => {
    try {
      setProcessing(prev => ({ ...prev, [`fb-${userId}`]: true }))
      await follows.unfollow(userId)
      setFollowingBack(prev => ({ ...prev, [userId]: false }))
    } catch (err) {
      console.error('Failed to unfollow:', err)
    } finally {
      setProcessing(prev => ({ ...prev, [`fb-${userId}`]: false }))
    }
  }

  const formatTime = (dateString) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = now - date
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const mentionItems = activity.filter(item => item.type === 'mention')

  const openActivityTarget = (item) => {
    if ((item.content_type || item.mention_type) === 'story' && item.story_id) {
      navigate(`/story/${item.story_id}`)
      return
    }

    if (item.post_id) {
      navigate(`/post/${item.post_id}`)
      return
    }
  }

  const pendingItems = activity.filter(item => item.type === 'follow' && item.status === 'pending')
  const acceptedItems = activity.filter(item => item.type === 'follow' && item.status === 'accepted')

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <div className="sticky top-0 bg-black border-b border-gray-800 px-4 h-14 flex items-center gap-3 z-50">
        <button onClick={() => navigate('/')} className="hover:opacity-60 text-white">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-lg font-semibold text-white">Notifications</h1>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : activity.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <Bell size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-sm font-medium">No notifications</p>
            <p className="text-xs mt-1">When you get notifications, they'll show up here</p>
          </div>
        ) : (
          <>
            {/* Mentions */}
            {mentionItems.length > 0 && (
              <div>
                <div className="px-4 py-3 border-b border-gray-800">
                  <h2 className="text-sm font-semibold text-white">Mentions</h2>
                </div>
                <div className="divide-y divide-gray-800">
                  {mentionItems.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openActivityTarget(item)}
                      className="w-full text-left p-4 flex items-center gap-3 hover:bg-gray-850"
                    >
                      <img
                        src={getAvatarUrl(item.actor)}
                        alt={item.actor?.name}
                        className="w-11 h-11 rounded-full object-cover cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(`/profile/${item.actor?.id}`)
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white">
                          <span className="font-semibold">{item.actor?.username || item.actor?.name}</span>
                          {item.actor?.is_approved && <VerifiedBadge size="xs" className="inline ml-0.5" />}
                          {' '}mentioned you in their {item.mention_type}.{' '}
                          <span className="text-gray-500">{formatTime(item.created_at)}</span>
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Pending Follow Requests */}
            {pendingItems.length > 0 && (
              <div>
                <div className="px-4 py-3 border-b border-gray-800">
                  <h2 className="text-sm font-semibold text-white">Follow Requests</h2>
                </div>
                <div className="divide-y divide-gray-800">
                  {pendingItems.map(item => (
                    <div key={item.id} className="p-4 flex items-center gap-3">
                      <img
                        src={getAvatarUrl(item.follower)}
                        alt={item.follower?.name}
                        className="w-11 h-11 rounded-full object-cover cursor-pointer"
                        onClick={() => navigate(`/profile/${item.follower?.id}`)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white">
                          <span className="font-semibold">{item.follower?.username || item.follower?.name}</span>
                          {item.follower?.is_approved && <VerifiedBadge size="xs" className="inline ml-0.5" />}
                          {' '}wants to follow you.{' '}
                          <span className="text-gray-500">{formatTime(item.created_at)}</span>
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => handleFollowRequest(item.id, 'accept')}
                          disabled={processing[item.id]}
                          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition disabled:opacity-50"
                        >
                          {processing[item.id] ? <Loader2 size={14} className="animate-spin" /> : 'Confirm'}
                        </button>
                        <button
                          onClick={() => handleFollowRequest(item.id, 'reject')}
                          disabled={processing[item.id]}
                          className="px-4 py-1.5 bg-gray-800 hover:bg-gray-700 text-white text-xs font-semibold rounded-lg transition disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Activity / Accepted follows */}
            {acceptedItems.length > 0 && (
              <div>
                {pendingItems.length > 0 && (
                  <div className="px-4 py-3 border-b border-gray-800">
                    <h2 className="text-sm font-semibold text-white">Earlier</h2>
                  </div>
                )}
                <div className="divide-y divide-gray-800">
                  {acceptedItems.map(item => (
                    <div key={item.id} className="p-4 flex items-center gap-3">
                      <img
                        src={getAvatarUrl(item.follower)}
                        alt={item.follower?.name}
                        className="w-11 h-11 rounded-full object-cover cursor-pointer"
                        onClick={() => navigate(`/profile/${item.follower?.id}`)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white">
                          <span className="font-semibold">{item.follower?.username || item.follower?.name}</span>
                          {item.follower?.is_approved && <VerifiedBadge size="xs" className="inline ml-0.5" />}
                          {' '}started following you.{' '}
                          <span className="text-gray-500">{formatTime(item.updated_at)}</span>
                        </p>
                      </div>
                      <div className="shrink-0">
                        {followingBack[item.follower?.id] ? (
                          <button
                            onClick={() => handleUnfollow(item.follower?.id)}
                            disabled={processing[`fb-${item.follower?.id}`]}
                            className="px-4 py-1.5 bg-gray-800 hover:bg-gray-700 text-white text-xs font-semibold rounded-lg transition disabled:opacity-50 min-w-22.5"
                          >
                            {processing[`fb-${item.follower?.id}`] ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Following'}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleFollowBack(item.follower?.id)}
                            disabled={processing[`fb-${item.follower?.id}`]}
                            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition disabled:opacity-50 min-w-22.5"
                          >
                            {processing[`fb-${item.follower?.id}`] ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Follow Back'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
