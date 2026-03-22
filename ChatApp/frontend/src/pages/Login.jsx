import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Logo from '../components/Logo'
import { auth } from '../api'

export default function Login() {
  const [searchParams] = useSearchParams()
  const verifiedParam = searchParams.get('verified')
  const [loginIdentifier, setLoginIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [showResendVerification, setShowResendVerification] = useState(
    verifiedParam === 'expired' || verifiedParam === 'invalid'
  )
  const [info, setInfo] = useState(() => {
    const verified = verifiedParam
    if (verified === 'success') return 'Email verified successfully. You can now log in.'
    if (verified === 'expired') return 'Verification link expired or invalid. Request a new link below.'
    if (verified === 'invalid') return 'Verification link is invalid. Request a new link below.'
    return ''
  })
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const { login } = useAuth()

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')
    setFieldErrors({})
    setShowResendVerification(false)
    setLoading(true)
    try {
      await login(loginIdentifier, password)
    } catch (err) {
      const errors = err.response?.data?.errors || {}
      const firstFieldError = Object.values(errors).flat()[0]
      const errorCode = err.response?.data?.code

      setFieldErrors({
        login: errors.login?.[0] || '',
        password: errors.password?.[0] || ''
      })

      if (errorCode === 'email_unverified') {
        setShowResendVerification(true)
      }

      setError(firstFieldError || err.response?.data?.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const handleResendVerification = async () => {
    const email = loginIdentifier.trim()
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    if (!emailPattern.test(email)) {
      setError('Enter your email first to resend verification.')
      return
    }

    setError('')
    setInfo('')
    setResending(true)

    try {
      const res = await auth.resendVerification({ email })
      setInfo(res.data?.message || 'Verification link sent.')
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to resend verification link')
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#05070f] text-white relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,0.14),transparent_42%),radial-gradient(circle_at_80%_10%,rgba(59,130,246,0.12),transparent_38%),radial-gradient(circle_at_50%_100%,rgba(15,23,42,0.9),transparent_55%)]" />

      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-6xl grid lg:grid-cols-2 rounded-3xl border border-slate-700/40 bg-black/35 backdrop-blur-md overflow-hidden shadow-[0_30px_90px_rgba(0,0,0,0.55)]">
          <section className="hidden lg:flex flex-col gap-7 p-10 bg-linear-to-br from-slate-950 via-slate-900 to-[#0a1020] border-r border-slate-700/30">
            <div>
              <Logo size="lg" />
              <p className="mt-7 text-4xl leading-tight font-semibold text-slate-100">
                Campus sparks start here.
              </p>
              <p className="mt-4 text-slate-300/85 text-base leading-relaxed max-w-md">
                WolloGram is your after-class vibe: verified students, flirty chats, and genuine connections that can turn into real stories.
              </p>
            </div>

            <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/8 px-4 py-4">
              <p className="text-[11px] tracking-[0.18em] text-cyan-200/80">TONIGHT ON CAMPUS</p>
              <p className="mt-2 text-sm text-slate-100">New story drops, live chats, and friend-of-friend intros are active right now.</p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs text-slate-200/90">
              <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-3">
                <p className="text-slate-100 font-semibold">Verified-only network</p>
                <p className="mt-1 text-slate-400">No random outsiders in your match pool.</p>
              </div>
              <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-3">
                <p className="text-slate-100 font-semibold">Real-time chat pulse</p>
                <p className="mt-1 text-slate-400">See who is online and start talking fast.</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-xs text-slate-300/90 mt-1">
              <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-3">Verified campus-only dating</div>
              <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-3">From hello to heartbeat</div>
              <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-3">Late-night conversations, instantly</div>
            </div>
          </section>

          <section className="p-6 sm:p-10">
            <div className="max-w-md mx-auto">
              <div className="lg:hidden mb-7 flex justify-center">
                <Logo size="lg" />
              </div>

              <h1 className="text-3xl font-semibold tracking-tight">Log in</h1>
              <p className="mt-2 text-sm text-slate-300">Your campus crush is for sure in the app. Go in and say hi.</p>

              <form onSubmit={handleSubmit} className="mt-8 space-y-3.5">
                <input
                  type="text"
                  placeholder="Email or username"
                  value={loginIdentifier}
                  onChange={e => setLoginIdentifier(e.target.value)}
                  className="input-ig"
                  required
                />
                {fieldErrors.login && (
                  <p className="text-rose-400 text-xs -mt-1">{fieldErrors.login}</p>
                )}
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="input-ig"
                  required
                />
                {fieldErrors.password && (
                  <p className="text-rose-400 text-xs -mt-1">{fieldErrors.password}</p>
                )}

                <button
                  type="submit"
                  disabled={loading || !loginIdentifier || !password}
                  className="btn-primary w-full mt-1!"
                >
                  {loading ? 'Logging in...' : 'Log In'}
                </button>
              </form>

              {info && <p className="text-emerald-400 text-sm mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">{info}</p>}
              {error && <p className="text-rose-400 text-sm mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2">{error}</p>}

              <div className="mt-5 flex items-center justify-between gap-3">
                {showResendVerification ? (
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    disabled={resending || !loginIdentifier}
                    className="text-sm text-slate-200 hover:text-white disabled:opacity-50"
                  >
                    {resending ? 'Sending verification...' : 'Resend verification email'}
                  </button>
                ) : (
                  <span className="text-sm text-slate-500">&nbsp;</span>
                )}

                <Link to="/forgot-password" className="text-sm text-slate-400 hover:text-slate-200">
                  Forgot password?
                </Link>
              </div>

              <div className="flex items-center my-6">
                <div className="flex-1 h-px bg-slate-700/70" />
                <span className="px-4 text-slate-500 text-xs font-semibold tracking-[0.2em]">OR</span>
                <div className="flex-1 h-px bg-slate-700/70" />
              </div>

              <div className="rounded-xl border border-slate-700/60 bg-slate-900/30 p-4 text-center">
                <p className="text-sm text-slate-300">
                  Don&apos;t have an account?{' '}
                  <Link to="/signup" className="text-white font-semibold hover:text-cyan-300">Sign up</Link>
                </p>
              </div>

              <div className="mt-8 text-center text-[11px] text-slate-500 leading-relaxed">
                <p>Copyright © 2026 WolloGram. All rights reserved.</p>
                <p>
                  Developed by{' '}
                  <a
                    href="https://t.me/M0nst3r1"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-300 underline decoration-slate-500/50 hover:text-cyan-300"
                  >
                    Abel Tewodros
                  </a>
                  .
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
