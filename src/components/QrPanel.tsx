import QRCode from 'qrcode'
import { Check, Copy, Share2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { copyText } from '../lib/browser.ts'

interface QrPanelProps {
  value: string
  label: string
  helper?: string
  shareTitle?: string
  shareText?: string
  compact?: boolean
}

export function QrPanel({ value, label, helper, shareTitle, shareText, compact = false }: QrPanelProps) {
  const [dataUrl, setDataUrl] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let active = true
    QRCode.toDataURL(value, {
      margin: 1,
      width: compact ? 210 : 280,
      errorCorrectionLevel: 'M',
      color: { dark: '#06131f', light: '#ffffff' },
    }).then((url) => {
      if (active) setDataUrl(url)
    }).catch(() => {
      if (active) setDataUrl('')
    })
    return () => { active = false }
  }, [value, compact])

  async function copy() {
    const ok = await copyText(value)
    if (!ok) return
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  async function share() {
    if (navigator.share) {
      await navigator.share({ title: shareTitle ?? label, text: shareText, url: value }).catch(() => undefined)
    } else {
      await copy()
    }
  }

  return (
    <div className={`qr-panel ${compact ? 'qr-panel--compact' : ''}`}>
      <div className="qr-frame" aria-label={`${label} QR code`}>
        {dataUrl ? <img src={dataUrl} alt={`${label} QR code`} /> : <div className="qr-placeholder" />}
        <span className="qr-mark" aria-hidden="true">↻</span>
      </div>
      <div className="qr-copy">
        <strong>{label}</strong>
        {helper ? <span>{helper}</span> : null}
      </div>
      <div className="inline-actions">
        <button className="button button--quiet button--small" type="button" onClick={copy}>
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? 'copied' : 'copy'}
        </button>
        <button className="button button--quiet button--small" type="button" onClick={share}>
          <Share2 size={16} /> share
        </button>
      </div>
    </div>
  )
}
