import { BarChart3, Check, Copy, History, Pause, Play, Plus, Share2, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { loadMerchantActivity, type MerchantActivityRecord } from '../lib/activity.ts'
import { copyText } from '../lib/browser.ts'
import { buildCounterLink, lunaToNim, newNonce } from '../lib/protocol.ts'
import { loadCounters, loadReceipts, upsertCounter } from '../lib/storage.ts'
import type { MerchantCounter, TurnReceipt } from '../types.ts'

const PAUSED_KEY = 'turn:paused-counters:v1'
const PRESETS = [
  ['Reusable cup', '1'],
  ['Reusable bowl', '2'],
  ['Reusable bottle', '2'],
  ['Food tray', '1'],
  ['Event badge', '5'],
  ['Locker key', '5'],
] as const

function pausedIds(): string[] {
  try { return JSON.parse(localStorage.getItem(PAUSED_KEY) ?? '[]') as string[] } catch { return [] }
}
function savePaused(ids: string[]) { try { localStorage.setItem(PAUSED_KEY, JSON.stringify(ids)) } catch { /* Local preference only. */ } }
function appBase() { return new URL(import.meta.env.BASE_URL, window.location.origin).toString() }

export function TurnTools() {
  const [open, setOpen] = useState(false)
  const [counters, setCounters] = useState<MerchantCounter[]>(() => loadCounters())
  const [receipts, setReceipts] = useState<TurnReceipt[]>(() => loadReceipts())
  const [selectedId, setSelectedId] = useState(counters[0]?.id ?? '')
  const [paused, setPaused] = useState<string[]>(() => pausedIds())
  const [activity, setActivity] = useState<MerchantActivityRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const selected = counters.find((counter) => counter.id === selectedId) ?? counters[0]

  useEffect(() => {
    const refresh = () => { setCounters(loadCounters()); setReceipts(loadReceipts()) }
    const timer = window.setInterval(refresh, 2500)
    window.addEventListener('storage', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('storage', refresh) }
  }, [])

  const stats = useMemo(() => ({
    deposits: activity.length,
    returned: activity.filter((row) => row.refunded).length,
    outstanding: activity.filter((row) => !row.refunded).length,
  }), [activity])

  async function refreshActivity() {
    if (!selected) return
    setLoading(true); setMessage('')
    try { setActivity(await loadMerchantActivity(selected.merchantAddress, selected.depositLuna)) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not load activity.') }
    finally { setLoading(false) }
  }

  async function shareCounter() {
    if (!selected) return
    if (paused.includes(selected.id)) { setMessage('Sharing is disabled for this counter on this device. Enable sharing first.'); return }
    const url = buildCounterLink(appBase(), selected)
    if (navigator.share) await navigator.share({ title: `${selected.merchantName} turn counter`, text: `${selected.itemName} · ${lunaToNim(selected.depositLuna)} NIM refundable deposit`, url }).catch(() => undefined)
    else { await copyText(url); setMessage('Counter link copied.') }
  }

  function duplicateCounter() {
    if (!selected) return
    const copy: MerchantCounter = { ...selected, id: newNonce(), itemName: `${selected.itemName} copy`, createdAt: Date.now() }
    setCounters(upsertCounter(copy)); setSelectedId(copy.id); setMessage('Counter duplicated. Edit it from Counter settings.')
  }

  function togglePause() {
    if (!selected) return
    const next = paused.includes(selected.id) ? paused.filter((id) => id !== selected.id) : [...paused, selected.id]
    savePaused(next); setPaused(next)
    setMessage(next.includes(selected.id)
      ? 'Sharing disabled on this device. Existing links and QR codes remain valid.'
      : 'Sharing enabled on this device.')
  }

  function createPreset(itemName: string, nim: string) {
    if (!selected) { setMessage('Create one counter first so turn knows the merchant wallet.'); return }
    const next: MerchantCounter = { ...selected, id: newNonce(), itemName, depositLuna: Math.round(Number(nim) * 100_000), createdAt: Date.now() }
    setCounters(upsertCounter(next)); setSelectedId(next.id); setMessage(`${itemName} preset created.`)
  }

  async function shareReceipt(receipt: TurnReceipt) {
    const text = [`turn receipt`, `${receipt.itemName} · ${receipt.merchantName}`, `deposit: ${lunaToNim(receipt.depositLuna)} NIM`, `status: ${receipt.status === 'refunded' ? 'completed' : receipt.status === 'active' ? 'ready to return' : 'confirming'}`, `deposit tx: ${receipt.txHash}`, receipt.refundTxHash ? `refund tx: ${receipt.refundTxHash}` : ''].filter(Boolean).join('\n')
    if (navigator.share) await navigator.share({ title: 'turn receipt', text }).catch(() => undefined)
    else { await copyText(text); setMessage('Receipt proof copied.') }
  }

  if (!open) return <button type="button" aria-label="Open turn tools" onClick={() => setOpen(true)} style={fab}><SlidersHorizontal size={20} /></button>

  return <div style={backdrop} onClick={() => setOpen(false)}>
    <section style={sheet} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="turn merchant tools">
      <div style={head}><div><small style={eyebrow}>TURN TOOLS</small><h2 style={{margin:'4px 0 0'}}>Run your counters.</h2></div><button style={iconButton} type="button" aria-label="Close turn tools" onClick={() => setOpen(false)}><X /></button></div>
      {message ? <div style={notice}>{message}</div> : null}

      <label style={label}>Counter<select style={input} value={selected?.id ?? ''} onChange={(event) => { setSelectedId(event.target.value); setActivity([]) }}>{counters.map((counter) => <option key={counter.id} value={counter.id}>{counter.itemName} · {lunaToNim(counter.depositLuna)} NIM</option>)}</select></label>

      {selected ? <>
        <div style={actions}>
          <button type="button" style={button} onClick={shareCounter}><Share2 size={16}/> Share counter</button>
          <button type="button" style={button} onClick={duplicateCounter}><Copy size={16}/> Duplicate</button>
          <button type="button" style={button} onClick={togglePause}>{paused.includes(selected.id) ? <Play size={16}/> : <Pause size={16}/>} {paused.includes(selected.id) ? 'Enable sharing' : 'Disable sharing'}</button>
          <button type="button" style={button} onClick={refreshActivity} disabled={loading}><History size={16}/> {loading ? 'Syncing…' : 'Activity'}</button>
        </div>

        <div style={statsGrid}>
          <Stat label="Wallet deposits" value={stats.deposits}/><Stat label="Refunded" value={stats.returned}/><Stat label="Outstanding" value={stats.outstanding}/>
        </div>
        <small style={activityNote}>Activity is chain-derived for {lunaToNim(selected.depositLuna)} NIM deposits to this receiving wallet. Counters using the same wallet and amount are grouped.</small>

        {activity.length ? <div style={section}><div style={sectionTitle}><BarChart3 size={16}/> Wallet activity</div>{activity.map((row) => <div key={row.deposit.txHash} style={rowStyle}><span><strong>{lunaToNim(row.deposit.valueLuna)} NIM</strong><small style={muted}>{row.deposit.txHash.slice(0,9)}…{row.deposit.txHash.slice(-7)}</small></span><span style={{textAlign:'right'}}><b>{row.refunded ? 'Refunded' : 'Outstanding'}</b>{row.refundTxHash ? <small style={muted}>refund {row.refundTxHash.slice(0,8)}…</small> : null}</span></div>)}</div> : null}

        <div style={section}><div style={sectionTitle}><Plus size={16}/> Quick presets</div><div style={chips}>{PRESETS.map(([name,nim]) => <button type="button" key={name} style={chip} onClick={() => createPreset(name,nim)}>{name} · {nim} NIM</button>)}</div></div>
      </> : <div style={notice}>Create your first counter from the Counter tab.</div>}

      <div style={section}><div style={sectionTitle}><History size={16}/> Receipt lifecycle</div>{receipts.length ? receipts.slice(0,10).map((receipt) => <button key={receipt.txHash} type="button" style={{...rowStyle,width:'100%',border:0,color:'inherit',cursor:'pointer'}} onClick={() => shareReceipt(receipt)}><span><strong>{receipt.itemName}</strong><small style={muted}>{receipt.merchantName} · {lunaToNim(receipt.depositLuna)} NIM</small></span><span style={{textAlign:'right'}}><b>{receipt.status === 'refunded' ? 'Completed' : receipt.status === 'active' ? 'Ready to return' : 'Confirming'}</b><small style={muted}>tap to share proof</small></span></button>) : <small style={muted}>No receipts on this device yet.</small>}</div>

      <div style={latency}><Check size={17}/><span><strong>Safe confirmation flow</strong><small>Submitted transactions are saved immediately when storage is available. Confirmation can take several minutes; never pay again while a receipt is confirming.</small></span></div>
    </section>
  </div>
}

function Stat({label,value}:{label:string,value:number}) { return <div style={stat}><strong>{value}</strong><small>{label}</small></div> }
const fab: React.CSSProperties={position:'fixed',right:18,bottom:94,zIndex:40,width:48,height:48,borderRadius:16,border:'1px solid #314353',background:'#132736',color:'#f6c945',display:'grid',placeItems:'center',boxShadow:'0 12px 35px #0008'}
const backdrop: React.CSSProperties={position:'fixed',inset:0,zIndex:80,background:'#000b',display:'flex',alignItems:'flex-end',justifyContent:'center'}
const sheet: React.CSSProperties={width:'min(720px,100%)',maxHeight:'88vh',overflow:'auto',background:'#091a27',color:'#f7f5ed',border:'1px solid #294052',borderRadius:'28px 28px 0 0',padding:'22px',boxShadow:'0 -20px 60px #0008'}
const head: React.CSSProperties={display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}
const eyebrow: React.CSSProperties={color:'#f6c945',fontWeight:800,letterSpacing:'0.14em'}
const iconButton: React.CSSProperties={border:0,borderRadius:14,width:42,height:42,background:'#142a39',color:'#dce7ed'}
const notice: React.CSSProperties={marginTop:14,padding:'12px 14px',borderRadius:14,background:'#132b38',color:'#bcd0da',fontSize:14}
const label: React.CSSProperties={display:'grid',gap:7,marginTop:18,fontSize:13,color:'#9db0ba'}
const input: React.CSSProperties={width:'100%',padding:'13px 14px',borderRadius:13,border:'1px solid #314655',background:'#0d2230',color:'#fff',fontSize:15}
const actions: React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:9,marginTop:12}
const button: React.CSSProperties={display:'flex',alignItems:'center',justifyContent:'center',gap:7,padding:'11px 10px',borderRadius:13,border:'1px solid #314655',background:'#132736',color:'#eef4f6',fontWeight:700}
const statsGrid: React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginTop:14}
const stat: React.CSSProperties={padding:'14px 8px',textAlign:'center',borderRadius:14,background:'#102633',display:'grid',gap:3}
const activityNote: React.CSSProperties={display:'block',marginTop:8,color:'#8ea3ae',lineHeight:1.45}
const section: React.CSSProperties={marginTop:18,paddingTop:16,borderTop:'1px solid #203746'}
const sectionTitle: React.CSSProperties={display:'flex',gap:7,alignItems:'center',fontWeight:800,marginBottom:10}
const rowStyle: React.CSSProperties={display:'flex',justifyContent:'space-between',gap:12,padding:'11px 4px',borderBottom:'1px solid #1b3341',background:'transparent'}
const muted: React.CSSProperties={display:'block',marginTop:3,color:'#8ea3ae',fontSize:12}
const chips: React.CSSProperties={display:'flex',gap:7,flexWrap:'wrap'}
const chip: React.CSSProperties={padding:'8px 10px',borderRadius:999,border:'1px solid #314655',background:'#102633',color:'#dce7ed',fontSize:12}
const latency: React.CSSProperties={display:'flex',gap:10,marginTop:20,padding:'14px',borderRadius:16,background:'#1b302c',color:'#a9efd3'}
