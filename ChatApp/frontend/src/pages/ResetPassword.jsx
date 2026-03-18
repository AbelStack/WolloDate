import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Logo from '../components/Logo'
import { auth } from '../api'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [info, setInfo] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const token = useMemo(() => searchParams.get('token') || '', [searchParams])
  const email = useMemo(() => searchParams.get('email') || '', [searchParams])
  const hasRequiredParams = token && email

  const handleSubmit = async e => {
    e.preventDefault()
    setInfo('')
    setError('')
    setFieldErrors({})

    if (!hasRequiredParams) {
      setError('Invalid reset link. Please request a new password reset email.')
      return
    }

    setLoading(true)

    try {
      const res = await auth.resetPassword({
        token,
        email,
        password,
        password_confirmation: passwordConfirmation,
      })

      setInfo(res.data?.message || 'Password reset successful. Redirecting to login...')
      setTimeout(() => navigate('/login'), 1300)
    } catch (err) {
      const errors = err.response?.data?.errors || {}
      const firstFieldError = Object.values(errors).flat()[0]
      setFieldErrors({
        password: errors.password?.[0] || '',
        password_confirmation: errors.password_confirmation?.[0] || '',
        token: errors.token?.[0] || '',
      })
      setError(firstFieldError || err.response?.data?.message || 'Failed to reset password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#05070f] text-white relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,0.14),transparent_42%),radial-gradient(circle_at_80%_10%,rgba(59,130,246,0.12),transparent_38%),radial-gradient(circle_at_50%_100%,rgba(15,23,42,0.9),transparent_55%)]" />

      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-3xl border border-slate-700/40 bg-black/35 backdrop-blur-md overflow-hidden shadow-[0_30px_90px_rgba(0,0,0,0.55)] p-6 sm:p-10">
          <div className="mb-7 flex justify-center">
            <Logo size="lg" />
          </div>

          <h1 className="text-3xl font-semibold tracking-tight">Reset password</h1>
          <p className="mt-2 text-sm text-slate-300">
            Choose a new password for {email || 'your account'}.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-3.5">
            <input
              type="password"
              placeholder="New password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="input-ig"
              required
            />
            {fieldErrors.password && (
              <p className="text-rose-400 text-xs -mt-1">{fieldErrors.password}</p>
            )}

            <input
              type="password"
              placeholder="Confirm new password"
              value={passwordConfirmation}
              onChange={e => setPasswordConfirmation(e.target.value)}
              className="input-ig"
              required
            />
            {fieldErrors.password_confirmation && (
              <p className="text-rose-400 text-xs -mt-1">{fieldErrors.password_confirmation}</p>
            )}

            <button
              type="submit"
              disabled={loading || !password || !passwordConfirmation || !hasRequiredParams}
              className="btn-primary w-full mt-1!"
            >
              {loading ? 'Resetting password...' : 'Reset password'}
            </button>
          </form>

          {fieldErrors.token && <p className="text-rose-400 text-sm mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2">{fieldErrors.token}</p>}
          {info && <p className="text-emerald-400 text-sm mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">{info}</p>}
          {error && <p className="text-rose-400 text-sm mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2">{error}</p>}

          <div className="mt-6 text-center text-sm text-slate-300">
            <Link to="/login" className="text-white font-semibold hover:text-cyan-300">Back to login</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
