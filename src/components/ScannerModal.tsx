import QrScanner from 'qr-scanner'
import { Camera, Keyboard, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

interface ScannerModalProps {
  open: boolean
  title: string
  helper: string
  placeholder: string
  onClose: () => void
  onResult: (value: string) => void
}

export function ScannerModal({ open, title, helper, placeholder, onClose, onResult }: ScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [manual, setManual] = useState('')
  const [cameraError, setCameraError] = useState('')

  useEffect(() => {
    if (!open || !videoRef.current) return
    let settled = false
    const scanner = new QrScanner(
      videoRef.current,
      (result) => {
        if (settled) return
        settled = true
        scanner.stop()
        onResult(result.data)
      },
      {
        preferredCamera: 'environment',
        highlightScanRegion: true,
        highlightCodeOutline: true,
        returnDetailedScanResult: true,
      },
    )

    scanner.start().catch(() => {
      setCameraError('Camera unavailable. Paste the turn link or receipt below instead.')
    })

    return () => scanner.destroy()
  }, [open, onResult])

  useEffect(() => {
    if (!open) {
      setManual('')
      setCameraError('')
    }
  }, [open])

  if (!open) return null

  function submitManual(event: React.FormEvent) {
    event.preventDefault()
    if (manual.trim()) onResult(manual.trim())
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="scanner-sheet" role="dialog" aria-modal="true" aria-labelledby="scanner-title">
        <header className="sheet-header">
          <div>
            <span className="eyebrow"><Camera size={14} /> camera</span>
            <h2 id="scanner-title">{title}</h2>
            <p>{helper}</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close scanner" onClick={onClose}><X /></button>
        </header>

        <div className={`scanner-window ${cameraError ? 'scanner-window--error' : ''}`}>
          <video ref={videoRef} muted playsInline />
          <div className="scanner-corners" aria-hidden="true" />
          {cameraError ? <div className="camera-fallback"><Camera size={28} /><span>{cameraError}</span></div> : null}
        </div>

        <div className="or-rule"><span>or</span></div>
        <form className="manual-entry" onSubmit={submitManual}>
          <label htmlFor="manual-code"><Keyboard size={15} /> Paste instead</label>
          <div className="input-row">
            <input id="manual-code" value={manual} onChange={(event) => setManual(event.target.value)} placeholder={placeholder} autoCapitalize="off" autoCorrect="off" />
            <button className="button button--gold button--small" type="submit" disabled={!manual.trim()}>Use</button>
          </div>
        </form>
      </section>
    </div>
  )
}
