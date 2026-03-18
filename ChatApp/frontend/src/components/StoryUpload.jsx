import { useState, useRef } from 'react'
import { stories } from '../api'
import { useSocket } from '../context/useSocket'
import { X, Image as ImageIcon, Upload, Loader2 } from 'lucide-react'

export default function StoryUpload({ onClose, onComplete }) {
  const { emitFollowNotify } = useSocket()
  const [selectedFiles, setSelectedFiles] = useState([])
  const [previews, setPreviews] = useState([])
  const [activePreviewIndex, setActivePreviewIndex] = useState(0)
  const [caption, setCaption] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const fileInputRef = useRef(null)

  const revokePreviewUrl = (url) => {
    if (url && typeof url === 'string' && url.startsWith('blob:')) {
      URL.revokeObjectURL(url)
    }
  }

  const revokePreviewUrls = (urls) => {
    ;(urls || []).forEach((url) => revokePreviewUrl(url))
  }

  const handleFileSelect = async (e) => {
    const incomingFiles = Array.from(e.target.files || [])
    if (incomingFiles.length === 0) return

    setError('')

    if (incomingFiles.length > 20) {
      setError('You can upload up to 20 stories at once')
      return
    }

    const validated = []
    const validatedTypes = []

    for (const file of incomingFiles) {
      // Validate file type
      const ext = (file.name.split('.').pop() || '').toLowerCase()
      const mime = (file.type || '').toLowerCase()
      const imageExts = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'heif', 'avif', 'jfif'])
      const videoExts = new Set(['mp4', 'mov', 'webm', 'mkv', '3gp', 'avi', 'wmv', 'mpeg'])
      const isImage = mime.startsWith('image/') || imageExts.has(ext)
      const isVideo = mime.startsWith('video/') || videoExts.has(ext)

      if (!isImage && !isVideo) {
        setError('Only image and video files are allowed')
        return
      }

      // Validate file size (50MB max)
      if (file.size > 50 * 1024 * 1024) {
        setError('Each file must be less than 50MB')
        return
      }

      validated.push(file)
      validatedTypes.push(isVideo ? 'video' : 'image')
    }

    revokePreviewUrls(previews)
    setSelectedFiles(validated)
    setPreviews(validated.map((file) => URL.createObjectURL(file)))
    setActivePreviewIndex(0)
  }

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return

    try {
      setUploading(true)
      setError('')
      const res = await stories.upload(selectedFiles, caption)

      const mentionedUserIds = res?.data?.mentioned_user_ids || []
      mentionedUserIds.forEach((targetUserId) => emitFollowNotify(targetUserId))

      onComplete()
    } catch (err) {
      console.error('Failed to upload story:', err)
      setError(err.response?.data?.message || 'Failed to upload story')
    } finally {
      setUploading(false)
    }
  }

  const handleClear = () => {
    revokePreviewUrls(previews)
    setSelectedFiles([])
    setPreviews([])
    setActivePreviewIndex(0)
    setCaption('')
    setError('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="fixed inset-0 bg-black/85 z-60 flex items-end md:items-center justify-center md:p-6 overflow-y-auto">
      <div className="w-full h-full md:h-auto md:max-h-[92vh] md:max-w-2xl bg-black md:bg-gray-950 md:border md:border-gray-800 md:rounded-2xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-gray-800 shrink-0">
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-800 rounded-full"
        >
          <X className="w-6 h-6 text-white" />
        </button>
        <h2 className="text-white font-medium">Add Story</h2>
        <div className="w-10" />
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-4 overflow-y-auto">
        {selectedFiles.length === 0 ? (
          // File selection
          <div className="flex flex-col items-center gap-6 w-full max-w-md">
            <div className="w-32 h-32 rounded-full bg-gray-800 flex items-center justify-center">
              <Upload className="w-12 h-12 text-gray-400" />
            </div>
            <div className="text-center">
              <h3 className="text-white text-lg font-medium mb-2">Share a moment</h3>
              <p className="text-gray-400 text-sm mb-6">
                Add a photo or video to your story
              </p>
            </div>
            <div className="flex gap-4 flex-wrap justify-center">
              <button
                onClick={() => {
                  fileInputRef.current.value = ''
                  fileInputRef.current.accept = 'image/*,video/*'
                  fileInputRef.current.click()
                }}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700"
              >
                <ImageIcon className="w-5 h-5" />
                Select Media
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileSelect}
              multiple
            />
          </div>
        ) : (
          // Preview
          <div className="flex flex-col items-center gap-4 w-full max-w-md">
            <div className="relative w-full max-w-90 aspect-square bg-gray-900 rounded-xl overflow-hidden mx-auto">
              {selectedFiles[activePreviewIndex] && ((selectedFiles[activePreviewIndex].type || '').startsWith('video/') ? (
                <video
                  src={previews[activePreviewIndex]}
                  className="w-full h-full object-contain"
                  controls
                  autoPlay
                  muted
                  loop
                  onError={() => {
                    setError('Video preview is unavailable on this device, but the file is still selected and can be uploaded.')
                  }}
                />
              ) : previews[activePreviewIndex] ? (
                <img
                  src={previews[activePreviewIndex]}
                  alt="Preview"
                  className="w-full h-full object-contain"
                  onError={() => {
                    setPreviews((prev) => prev.map((item, idx) => (idx === activePreviewIndex ? null : item)))
                    setError('Image preview is unavailable on this device, but the file is still selected and can be uploaded.')
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-center px-6 text-sm text-gray-400">
                  Image preview unavailable on this browser.
                </div>
              ))}

              {previews.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setActivePreviewIndex((prev) => (prev - 1 + previews.length) % previews.length)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/60 hover:bg-black/80 rounded-full text-white"
                  >
                    {'<'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivePreviewIndex((prev) => (prev + 1) % previews.length)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/60 hover:bg-black/80 rounded-full text-white"
                  >
                    {'>'}
                  </button>
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
                    {activePreviewIndex + 1}/{previews.length}
                  </div>
                </>
              )}

              {/* Clear button */}
              <button
                onClick={handleClear}
                className="absolute top-3 right-3 p-2 bg-black/60 hover:bg-black/80 rounded-full"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={500}
              placeholder="Add a caption (optional)"
              className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
            />

            {error && (
              <p className="text-red-500 text-sm">{error}</p>
            )}

            <p className="text-xs text-gray-400">{selectedFiles.length} stor{selectedFiles.length === 1 ? 'y' : 'ies'} selected</p>

            <button
              onClick={handleUpload}
              disabled={uploading}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-blue-700"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Uploading...
                </>
              ) : (
                `Share ${selectedFiles.length} stor${selectedFiles.length === 1 ? 'y' : 'ies'}`
              )}
            </button>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="p-4 border-t border-gray-800 shrink-0">
        <p className="text-gray-500 text-xs text-center">
          Stories disappear after 24 hours. Only your followers can see your stories.
        </p>
      </div>
      </div>

    </div>
  )
}
