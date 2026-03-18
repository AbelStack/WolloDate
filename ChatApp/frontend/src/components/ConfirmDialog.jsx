export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  loading = false,
  onConfirm,
  onClose,
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-60 bg-black/70 flex items-center justify-center p-4" onClick={loading ? undefined : onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-gray-800 bg-gray-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-2">
          <h3 className="text-white text-lg font-semibold">{title}</h3>
          {message ? <p className="mt-2 text-sm text-gray-400">{message}</p> : null}
        </div>
        <div className="px-5 pb-5 pt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-gray-800 text-white text-sm hover:bg-gray-700 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 ${tone === 'danger' ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-blue-600 text-white hover:bg-blue-500'}`}
          >
            {loading ? 'Please wait...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
