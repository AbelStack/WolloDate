import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { users } from '../api'
import { ArrowLeft, Search as SearchIcon, UserPlus } from 'lucide-react'
import VerifiedBadge from '../components/VerifiedBadge'
import CreatorBadge from '../components/CreatorBadge'
import { isCreatorUser } from '../utils/creator'
import { getAvatarUrl } from '../utils/avatar'

export default function SearchPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  
  const [query, setQuery] = useState('')
  const [userResults, setUserResults] = useState([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef(null)

  // Debounced search - wait 300ms after user stops typing
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    
    if (query.length >= 2) {
      debounceRef.current = setTimeout(() => {
        performSearch()
      }, 300)
    } else {
      setUserResults([])
    }
    
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [query])

  const performSearch = async () => {
    setLoading(true)
    try {
      const res = await users.search(query)
      // Filter out the current user from results
      const results = (res.data.users || []).filter(u => u.id !== user?.id)
      setUserResults(results)
    } catch (err) {
      console.error('Search failed', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = e => {
    e.preventDefault()
    if (query.length >= 2) performSearch()
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <div className="sticky top-0 bg-black border-b border-gray-800 px-4 h-14 flex items-center gap-3 z-50">
        <button onClick={() => navigate('/')} className="hover:opacity-60 text-white">
          <ArrowLeft size={24} />
        </button>
        <form onSubmit={handleSubmit} className="flex-1">
          <div className="relative">
            <SearchIcon size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Search users..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full bg-gray-900 rounded-lg pl-10 pr-4 py-2 text-sm outline-none border border-gray-800 focus:border-blue-500 text-white placeholder-gray-600"
              autoFocus
            />
          </div>
        </form>
      </div>

      {/* Results */}
      <div className="max-w-2xl mx-auto">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
          </div>
        )}

        {!loading && query.length < 2 && (
          <div className="text-center py-12 text-gray-500">
            <SearchIcon size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-sm">Search for users by name or username</p>
            <p className="text-xs mt-1">Enter at least 2 characters</p>
          </div>
        )}

        {/* User results */}
        {!loading && query.length >= 2 && (
          <div>
            {userResults.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p className="text-sm">No users found for "{query}"</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-800">
                {userResults.map(u => (
                  <div 
                    key={u.id} 
                    onClick={() => navigate(`/profile/${u.id}`)}
                    className="p-4 flex items-center gap-3 hover:bg-gray-900 transition cursor-pointer"
                  >
                    <img 
                      src={getAvatarUrl(u)} 
                      className="w-12 h-12 rounded-full object-cover" 
                      alt={u.name} 
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-white flex items-center gap-1">
                        {u.name}
                        {u.is_approved && <VerifiedBadge size="xs" />}
                        {isCreatorUser(u) && <CreatorBadge size="xs" />}
                      </p>
                      {u.username && <p className="text-gray-500 text-xs">@{u.username}</p>}
                      {u.bio && <p className="text-xs text-gray-600 mt-1 line-clamp-1">{u.bio}</p>}
                    </div>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(`/profile/${u.id}`)
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
                    >
                      <UserPlus size={14} />
                      View
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
