import { useState } from 'react'
import { Link } from 'react-router-dom'
import Logo from '../components/Logo'
import { auth } from '../api'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [info, setInfo] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async e => {
    e.preventDefault()
    setInfo('')
    setError('')
    setLoading(true)

    try {
      const res = await auth.forgotPassword({ email: email.trim() })
      setInfo(res.data?.message || 'If this email exists, a password reset link has been sent.')
    } catch (err) {
      const fieldError = err.response?.data?.errors?.email?.[0]
      setError(fieldError || err.response?.data?.message || 'Failed to request password reset link')
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

          <h1 className="text-3xl font-semibold tracking-tight">Forgot password</h1>
          <p className="mt-2 text-sm text-slate-300">
            Enter your account email and we will send you a reset link.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-3.5">
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="input-ig"
              required
            />

            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="btn-primary w-full mt-1!"
            >
              {loading ? 'Sending reset link...' : 'Send reset link'}
            </button>
          </form>

          {info && <p className="text-emerald-400 text-sm mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">{info}</p>}
          {error && <p className="text-rose-400 text-sm mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2">{error}</p>}

          <div className="mt-6 text-center text-sm text-slate-300">
            Remembered your password?{' '}
            <Link to="/login" className="text-white font-semibold hover:text-cyan-300">Back to login</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
