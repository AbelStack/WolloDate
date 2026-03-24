import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Logo from '../components/Logo'
import { Upload } from 'lucide-react'
import { auth, campuses } from '../api'

export default function Signup() {
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [studentIdFile, setStudentIdFile] = useState(null)
  const [campusId, setCampusId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [customDepartment, setCustomDepartment] = useState('')
  const [campusList, setCampusList] = useState([])
  const [departments, setDepartments] = useState([])
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef(null)
  const passwordPolicyRegex = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/
  const passwordMeetsPolicy = passwordPolicyRegex.test(password)

  useEffect(() => {
    const fetchCampuses = async () => {
      try {
        const res = await campuses.list()
        setCampusList(res.data)
      } catch (err) {
        setError('Failed to load campuses')
      }
    }
    fetchCampuses()
  }, [])

  useEffect(() => {
    if (campusId) {
      const selected = campusList.find(c => c.id === parseInt(campusId))
      setDepartments(selected?.departments || [])
      setDepartmentId('')
    }
  }, [campusId, campusList])

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      const extension = (file.name.split('.').pop() || '').toLowerCase()
      const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'heif', 'avif', 'jfif']

      // Validate file type
      if (!file.type.startsWith('image/') && !imageExtensions.includes(extension)) {
        setError('Please upload an image file')
        return
      }
      // Validate file size (25MB max)
      if (file.size > 25 * 1024 * 1024) {
        setError('Image must be less than 25MB')
        return
      }
      setStudentIdFile(file)
      setError('')
    }
  }

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')
    setFieldErrors({})
    setLoading(true)
    
    if (!studentIdFile) {
      setError('Please upload your student ID card image')
      setLoading(false)
      return
    }

    if (!campusId || !departmentId) {
      setError('Please select campus and department')
      setLoading(false)
      return
    }

    try {
      await auth.signup({ 
        name, username, email, password, studentIdFile,
        campusId: parseInt(campusId),
        departmentId: parseInt(departmentId),
        customDepartment
      })
      setSuccess(true)
    } catch (err) {
      const fieldErrors = err.response?.data?.errors
      const firstFieldError = fieldErrors
        ? Object.values(fieldErrors).flat()[0]
        : null

      setFieldErrors({
        name: fieldErrors?.name?.[0] || '',
        username: fieldErrors?.username?.[0] || '',
        email: fieldErrors?.email?.[0] || '',
        password: fieldErrors?.password?.[0] || '',
        student_id_image: fieldErrors?.student_id_image?.[0] || '',
        campus_id: fieldErrors?.campus_id?.[0] || '',
        department_id: fieldErrors?.department_id?.[0] || '',
        custom_department: fieldErrors?.custom_department?.[0] || ''
      })

      const errMsg = firstFieldError || err.response?.data?.message || 'Signup failed'
      setError(errMsg)
    } finally {
      setLoading(false)
    }
  }

  // Show success message after registration
  if (success) {
    return (
      <div className="min-h-screen bg-[#05070f] text-white relative overflow-hidden flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,0.14),transparent_42%),radial-gradient(circle_at_80%_10%,rgba(59,130,246,0.12),transparent_38%),radial-gradient(circle_at_50%_100%,rgba(15,23,42,0.9),transparent_55%)]" />
        <div className="relative z-10 w-full max-w-lg rounded-3xl border border-slate-700/40 bg-black/35 backdrop-blur-md p-10 text-center shadow-[0_30px_90px_rgba(0,0,0,0.55)]">
          <div className="flex flex-col items-center mb-6 gap-2">
            <Logo size="lg" />
            <h1 className="text-3xl font-semibold text-white">Verify Your Email</h1>
          </div>
          <p className="text-slate-300 mb-7">
            We sent a verification link to <span className="text-white font-medium">{email}</span>. Verify your email, then log in to continue.
          </p>
          <Link to="/login" className="btn-primary inline-block px-8">
            Back to Login
          </Link>

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
      </div>
    )
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
                Find your campus person, not just another profile.
              </p>
              <p className="mt-4 text-slate-300/85 text-base leading-relaxed max-w-md">
                WolloGram mixes playful dating energy with verified student trust, so every match starts with confidence.
              </p>
            </div>

            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/8 px-4 py-4">
              <p className="text-[11px] tracking-[0.18em] text-blue-200/80">HOW IT WORKS</p>
              <div className="mt-3 space-y-2.5 text-sm text-slate-200">
                <p><span className="text-slate-100 font-semibold">1.</span> Verify with campus ID</p>
                <p><span className="text-slate-100 font-semibold">2.</span> Build your profile vibe</p>
                <p><span className="text-slate-100 font-semibold">3.</span> Match and start real conversations</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs text-slate-200/90">
              <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-3">
                <p className="text-slate-100 font-semibold">Private by default</p>
                <p className="mt-1 text-slate-400">You control who can follow and view your content.</p>
              </div>
              <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-3">
                <p className="text-slate-100 font-semibold">Safer community</p>
                <p className="mt-1 text-slate-400">Moderation and reports keep the space clean.</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-xs text-slate-300/90 mt-1">
              <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-3">Verified student dating only</div>
              <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-3">No random outsiders</div>
              <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-3">Playful chats, real connections</div>
            </div>
          </section>

          <section className="p-6 sm:p-10">
            <div className="max-w-md mx-auto">
              <div className="lg:hidden mb-7 flex justify-center">
                <Logo size="lg" />
              </div>

              <h1 className="text-3xl font-semibold tracking-tight">Create account</h1>
              <p className="mt-2 text-sm text-slate-300">Quick signup. Clean vibes. Meet people from your campus.</p>

              <form onSubmit={handleSubmit} className="mt-8 space-y-3.5">
            <input
              type="text"
              placeholder="Full Name"
              value={name}
              onChange={e => setName(e.target.value)}
              className="input-ig"
              required
            />
            {fieldErrors.name && <p className="text-rose-400 text-xs -mt-1">{fieldErrors.name}</p>}
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={e => setUsername(e.target.value.toLowerCase())}
              className="input-ig"
              minLength={3}
              maxLength={30}
              required
            />
            {fieldErrors.username && <p className="text-rose-400 text-xs -mt-1">{fieldErrors.username}</p>}
            {!fieldErrors.username && username && username.length >= 3 && !/^\p{L}[\p{L}\p{N}\p{M}\p{Pd}\p{Pc}\p{S}\d_\-.@]*$/u.test(username) && (
              <p className="text-rose-400 text-xs -mt-1">Username must start with a letter and can contain letters, numbers, symbols, and Amharic characters.</p>
            )}
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="input-ig"
              required
            />
            {fieldErrors.email && <p className="text-rose-400 text-xs -mt-1">{fieldErrors.email}</p>}

            <input
              type="password"
              placeholder="Password (min 8 chars, letter + number)"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="input-ig"
              minLength={8}
              required
            />
            {fieldErrors.password && <p className="text-rose-400 text-xs -mt-1">{fieldErrors.password}</p>}
            {!fieldErrors.password && password && !passwordMeetsPolicy && (
              <p className="text-rose-400 text-xs -mt-1">Password must be at least 8 characters and include at least one letter and one number.</p>
            )}

            <select
              value={campusId}
              onChange={e => setCampusId(e.target.value)}
              className="input-ig"
              required
            >
              <option value="">Select Campus</option>
              {campusList.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {fieldErrors.campus_id && <p className="text-rose-400 text-xs -mt-1">{fieldErrors.campus_id}</p>}

            <select
              value={departmentId}
              onChange={e => setDepartmentId(e.target.value)}
              className="input-ig"
              disabled={!campusId}
              required
            >
              <option value="">Select Department</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            {fieldErrors.department_id && <p className="text-rose-400 text-xs -mt-1">{fieldErrors.department_id}</p>}

            {departmentId && departments.find(d => d.id === parseInt(departmentId))?.name === 'Other (specify)' && (
              <>
                <input
                  type="text"
                  placeholder="Specify your department"
                  value={customDepartment}
                  onChange={e => setCustomDepartment(e.target.value)}
                  className="input-ig"
                  maxLength={100}
                  required
                />
                {fieldErrors.custom_department && <p className="text-rose-400 text-xs -mt-1">{fieldErrors.custom_department}</p>}
              </>
            )}
            
            {/* Student ID Upload */}
            <div className="pt-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 hover:bg-gray-700 transition-colors"
              >
                <Upload size={18} />
                {studentIdFile ? studentIdFile.name : 'Upload Student ID Card'}
              </button>
              <p className="text-gray-500 text-xs mt-1 text-center">
                Required for verification (image, max 25MB)
              </p>
              {fieldErrors.student_id_image && <p className="text-rose-400 text-xs mt-2 text-center">{fieldErrors.student_id_image}</p>}
            </div>

            <button
              type="submit"
              disabled={loading || !name || !username || !email || !password || !passwordMeetsPolicy || !studentIdFile || !campusId || !departmentId || (departments.find(d => d.id === parseInt(departmentId))?.name === 'Other (specify)' && !customDepartment)}
              className="btn-primary w-full mt-1!"
            >
              {loading ? 'Submitting...' : 'Sign Up'}
            </button>
          </form>

              {error && <p className="text-rose-400 text-sm mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2">{error}</p>}

              <p className="text-slate-500 text-xs mt-5 leading-relaxed">
                By signing up, you agree to our Terms, Privacy Policy and Cookies Policy.
              </p>

              <div className="rounded-xl border border-slate-700/60 bg-slate-900/30 p-4 text-center mt-6">
                <p className="text-sm text-slate-300">
                  Have an account?{' '}
                  <Link to="/login" className="text-white font-semibold hover:text-cyan-300">Log in</Link>
                </p>
              </div>

              <div className="mt-7 text-center text-[11px] text-slate-500 leading-relaxed">
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
