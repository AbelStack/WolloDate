import { useEffect, useRef, useState } from 'react'

export default function ImageCropModal({
  sourceFile,
  title = 'Adjust Image',
  confirmLabel = 'Done',
  outputName = 'image.jpg',
  aspect = null,
  onCancel,
  onDone,
  onUseOriginal,
}) {
  const [sourceUrl, setSourceUrl] = useState(null)
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [imageSize, setImageSize] = useState({ width: 1, height: 1 })
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')

  const dragRef = useRef(null)
  const viewportRef = useRef(null)
  const imageRef = useRef(null)
  const objectUrlRef = useRef(null)
  const conversionAttemptedRef = useRef(false)
  const canUseOriginal = typeof onUseOriginal === 'function' && !!sourceFile

  const effectiveAspect = aspect || (imageSize.width / imageSize.height) || 1

  useEffect(() => {
    if (!sourceFile) return

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }

    setLoadError('')
    setCropPosition({ x: 0, y: 0 })
    setZoom(1)
    conversionAttemptedRef.current = false

    const objectUrl = URL.createObjectURL(sourceFile)
    objectUrlRef.current = objectUrl
    setSourceUrl(objectUrl)

    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
    }
  }, [sourceFile])

  const tryConversionForPreview = async () => {
    if (!sourceFile || conversionAttemptedRef.current) return false
    conversionAttemptedRef.current = true

    try {
      const mod = await import('heic2any')
      const heic2any = mod?.default || mod
      const converted = await heic2any({
        blob: sourceFile,
        toType: 'image/jpeg',
        quality: 0.92,
      })
      const blob = Array.isArray(converted) ? converted[0] : converted
      if (!blob) return false

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
      }
      const nextUrl = URL.createObjectURL(blob)
      objectUrlRef.current = nextUrl
      setSourceUrl(nextUrl)
      setLoadError('')
      return true
    } catch (err) {
      return false
    }
  }

  const handleSave = async () => {
    if (!sourceUrl || !imageRef.current || !viewportRef.current) return

    setSaving(true)
    try {
      const img = imageRef.current
      const viewportRect = viewportRef.current.getBoundingClientRect()
      const viewW = viewportRect.width
      const viewH = viewportRect.height

      const outputW = Math.min(1600, Math.max(800, Math.round(img.naturalWidth)))
      const outputH = Math.round(outputW / effectiveAspect)

      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      canvas.width = outputW
      canvas.height = outputH

      const baseScale = Math.max(outputW / img.naturalWidth, outputH / img.naturalHeight)
      const finalScale = baseScale * zoom
      const tx = cropPosition.x * (outputW / viewW)
      const ty = cropPosition.y * (outputH / viewH)

      ctx.translate(outputW / 2 + tx, outputH / 2 + ty)
      ctx.scale(finalScale, finalScale)
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
      if (!blob) {
        throw new Error('Failed to process cropped image')
      }
      const croppedFile = new File([blob], outputName, { type: 'image/jpeg' })
      onDone(croppedFile)
    } catch (err) {
      setLoadError('Could not process this image. Please choose another photo.')
    } finally {
      setSaving(false)
    }
  }

  const handlePreviewFailure = async () => {
    const convertedOk = await tryConversionForPreview()
    if (convertedOk) return

    if (canUseOriginal) {
      onUseOriginal(sourceFile)
      return
    }

    setSourceUrl(null)
    setLoadError('This photo could not be previewed on your device.')
  }

  return (
    <div className="fixed inset-0 bg-black/85 z-70 flex items-end md:items-center justify-center md:p-6 overflow-y-auto">
      <div className="w-full h-full md:h-auto md:max-h-[92vh] md:max-w-3xl bg-black md:bg-gray-950 md:border md:border-gray-800 md:rounded-2xl flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-gray-800 shrink-0">
        <button onClick={onCancel} className="text-white hover:text-gray-300">Cancel</button>
        <h2 className="font-semibold text-white">{title}</h2>
        <button
          onClick={() => {
            if (sourceUrl) {
              handleSave()
              return
            }
            if (canUseOriginal) {
              onUseOriginal(sourceFile)
            }
          }}
          disabled={saving || (!sourceUrl && !canUseOriginal)}
          className="text-blue-500 font-semibold hover:text-blue-400 disabled:opacity-50"
        >
          {saving ? 'Saving...' : sourceUrl ? confirmLabel : 'Use Original'}
        </button>
      </div>

      <div
        className="flex-1 min-h-0 flex items-center justify-center p-4 overflow-hidden touch-none"
        onMouseDown={(e) => {
          dragRef.current = {
            startX: e.clientX - cropPosition.x,
            startY: e.clientY - cropPosition.y,
          }
        }}
        onMouseMove={(e) => {
          if (!dragRef.current) return
          setCropPosition({
            x: e.clientX - dragRef.current.startX,
            y: e.clientY - dragRef.current.startY,
          })
        }}
        onMouseUp={() => {
          dragRef.current = null
        }}
        onMouseLeave={() => {
          dragRef.current = null
        }}
        onTouchStart={(e) => {
          const t = e.touches[0]
          dragRef.current = {
            startX: t.clientX - cropPosition.x,
            startY: t.clientY - cropPosition.y,
          }
        }}
        onTouchMove={(e) => {
          if (!dragRef.current) return
          const t = e.touches[0]
          setCropPosition({
            x: t.clientX - dragRef.current.startX,
            y: t.clientY - dragRef.current.startY,
          })
        }}
        onTouchEnd={() => {
          dragRef.current = null
        }}
        onWheel={(e) => {
          e.preventDefault()
          setZoom((z) => Math.min(3, Math.max(1, z + (e.deltaY > 0 ? -0.1 : 0.1))))
        }}
      >
        <div
          ref={viewportRef}
          className="relative w-full max-w-140 overflow-hidden border border-white/30 rounded-xl"
          style={{ aspectRatio: `${effectiveAspect}` }}
        >
          {loadError && (
            <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-red-400 bg-black/50">
              {loadError}
            </div>
          )}
          {sourceUrl && (
            <img
              ref={imageRef}
              src={sourceUrl}
              alt="Crop preview"
              onLoad={async (e) => {
                const width = Number(e.currentTarget.naturalWidth)
                const height = Number(e.currentTarget.naturalHeight)
                if (!width || !height) {
                  await handlePreviewFailure()
                  return
                }

                setLoadError('')
                setImageSize({ width, height })
              }}
              className="absolute w-full h-full object-cover"
              style={{
                transform: `translate(${cropPosition.x}px, ${cropPosition.y}px) scale(${zoom})`,
              }}
              onError={handlePreviewFailure}
              draggable={false}
            />
          )}
        </div>
      </div>

      <div className="p-4 border-t border-gray-800 shrink-0">
        <label className="text-sm text-gray-400 mb-2 block text-center">Zoom</label>
        <input
          type="range"
          min="1"
          max="3"
          step="0.1"
          value={zoom}
          onChange={(e) => setZoom(parseFloat(e.target.value))}
          className="w-full accent-blue-500"
        />
        <p className="text-xs text-gray-500 text-center mt-2">Drag to move image • Scroll or slide to zoom</p>
      </div>
      </div>
    </div>
  )
}
