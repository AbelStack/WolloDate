import { useEffect, useRef, useState } from 'react'

export default function GlobalAlertBridge() {
  const [alerts, setAlerts] = useState([])
  const timersRef = useRef(new Map())

  useEffect(() => {
    const nativeAlert = window.alert

    window.alert = (message) => {
      const id = Date.now() + Math.random()
      const text = typeof message === 'string' ? message : JSON.stringify(message)
      setAlerts((prev) => [...prev, { id, text }])

      const timer = setTimeout(() => {
        setAlerts((prev) => prev.filter((a) => a.id !== id))
        timersRef.current.delete(id)
      }, 3500)

      timersRef.current.set(id, timer)
    }

    return () => {
      window.alert = nativeAlert
      timersRef.current.forEach((timer) => clearTimeout(timer))
      timersRef.current.clear()
    }
  }, [])

  if (alerts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-200 flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)]">
      {alerts.map((alert) => (
        <div key={alert.id} className="rounded-xl border border-blue-400/40 bg-gray-900/95 text-white px-4 py-3 shadow-2xl backdrop-blur-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm leading-5">{alert.text}</p>
            <button
              onClick={() => {
                const timer = timersRef.current.get(alert.id)
                if (timer) {
                  clearTimeout(timer)
                  timersRef.current.delete(alert.id)
                }
                setAlerts((prev) => prev.filter((a) => a.id !== alert.id))
              }}
              className="text-gray-300 hover:text-white"
              aria-label="Dismiss alert"
            >
              x
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
