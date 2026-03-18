import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { auth } from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    const token = localStorage.getItem('token')
    if (!token) {
      localStorage.removeItem('user')
      if (isMounted) {
        setUser(null)
        setLoading(false)
      }
      return () => {
        isMounted = false
      }
    }

    auth.me()
      .then(res => {
        if (!isMounted) return
        setUser(res.data.user)
        localStorage.setItem('user', JSON.stringify(res.data.user))
      })
      .catch(() => {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        if (!isMounted) return
        setUser(null)
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    const syncFromStorage = () => {
      const token = localStorage.getItem('token')
      if (!token) {
        localStorage.removeItem('user')
        setUser(null)
      }
    }

    window.addEventListener('storage', syncFromStorage)
    window.addEventListener('focus', syncFromStorage)

    return () => {
      window.removeEventListener('storage', syncFromStorage)
      window.removeEventListener('focus', syncFromStorage)
    }
  }, [])

  const refreshUser = useCallback(async () => {
    try {
      const res = await auth.me()
      setUser(res.data.user)
      localStorage.setItem('user', JSON.stringify(res.data.user))
      return res.data.user
    } catch (err) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      setUser(null)
      console.error('Failed to refresh user', err)
      return null
    }
  }, [])

  const login = async (login, password) => {
    const res = await auth.login({ login, password })
    localStorage.setItem('token', res.data.token)
    localStorage.setItem('user', JSON.stringify(res.data.user))
    setUser(res.data.user)
    return res.data
  }

  const logout = async () => {
    try { await auth.logout() } catch {}
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, setUser, login, logout, loading, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
