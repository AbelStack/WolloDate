import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { admin as adminApi } from '../api'

const AdminAuthContext = createContext(null)

export function AdminAuthProvider({ children }) {
  const [admin, setAdmin] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    const bootstrapAdmin = async () => {
      const token = localStorage.getItem('adminToken')

      if (!token) {
        localStorage.removeItem('admin')
        if (isMounted) {
          setAdmin(null)
          setLoading(false)
        }
        return
      }

      try {
        const res = await adminApi.me()
        if (!isMounted) return
        setAdmin(res.data)
        localStorage.setItem('admin', JSON.stringify(res.data))
      } catch {
        localStorage.removeItem('adminToken')
        localStorage.removeItem('admin')
        if (!isMounted) return
        setAdmin(null)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    bootstrapAdmin()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    const syncFromStorage = () => {
      const token = localStorage.getItem('adminToken')
      if (!token) {
        localStorage.removeItem('admin')
        setAdmin(null)
      }
    }

    window.addEventListener('storage', syncFromStorage)
    window.addEventListener('focus', syncFromStorage)

    return () => {
      window.removeEventListener('storage', syncFromStorage)
      window.removeEventListener('focus', syncFromStorage)
    }
  }, [])

  const refreshAdmin = useCallback(async () => {
    try {
      const res = await adminApi.me()
      setAdmin(res.data)
      localStorage.setItem('admin', JSON.stringify(res.data))
      return res.data
    } catch {
      localStorage.removeItem('adminToken')
      localStorage.removeItem('admin')
      setAdmin(null)
      return null
    }
  }, [])

  const login = useCallback(async (email, password) => {
    const res = await adminApi.login({ email, password })
    localStorage.setItem('adminToken', res.data.token)
    localStorage.setItem('admin', JSON.stringify(res.data.admin))
    setAdmin(res.data.admin)
    return res.data
  }, [])

  const logout = useCallback(async () => {
    try {
      await adminApi.logout()
    } catch {}

    localStorage.removeItem('adminToken')
    localStorage.removeItem('admin')
    setAdmin(null)
  }, [])

  return (
    <AdminAuthContext.Provider value={{ admin, loading, login, logout, refreshAdmin }}>
      {children}
    </AdminAuthContext.Provider>
  )
}

export const useAdminAuth = () => useContext(AdminAuthContext)