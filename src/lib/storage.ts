import type { CounterConfig, TurnReceipt } from '../types.ts'

const COUNTER_KEY = 'turn:counter:v1'
const RECEIPTS_KEY = 'turn:receipts:v1'
const REFUND_LOCK_PREFIX = 'turn:refund-lock:'

function hasStorage(): boolean {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}

export function loadCounter(): CounterConfig | null {
  if (!hasStorage()) return null
  try {
    const value = localStorage.getItem(COUNTER_KEY)
    return value ? (JSON.parse(value) as CounterConfig) : null
  } catch {
    return null
  }
}

export function saveCounter(counter: CounterConfig): void {
  if (!hasStorage()) return
  localStorage.setItem(COUNTER_KEY, JSON.stringify(counter))
}

export function clearCounter(): void {
  if (!hasStorage()) return
  localStorage.removeItem(COUNTER_KEY)
}

export function loadReceipts(): TurnReceipt[] {
  if (!hasStorage()) return []
  try {
    const value = localStorage.getItem(RECEIPTS_KEY)
    const parsed = value ? (JSON.parse(value) as TurnReceipt[]) : []
    return Array.isArray(parsed) ? parsed.sort((a, b) => b.createdAt - a.createdAt) : []
  } catch {
    return []
  }
}

export function upsertReceipt(receipt: TurnReceipt): TurnReceipt[] {
  const receipts = loadReceipts().filter((item) => item.txHash.toLowerCase() !== receipt.txHash.toLowerCase())
  receipts.unshift(receipt)
  if (hasStorage()) localStorage.setItem(RECEIPTS_KEY, JSON.stringify(receipts.slice(0, 50)))
  return receipts
}

export function acquireRefundLock(txHash: string, ttlMs = 120_000): boolean {
  if (!hasStorage()) return true
  const key = `${REFUND_LOCK_PREFIX}${txHash.toLowerCase()}`
  const now = Date.now()
  const current = Number(localStorage.getItem(key) ?? 0)
  if (current > now) return false
  localStorage.setItem(key, String(now + ttlMs))
  return true
}

export function releaseRefundLock(txHash: string): void {
  if (!hasStorage()) return
  localStorage.removeItem(`${REFUND_LOCK_PREFIX}${txHash.toLowerCase()}`)
}
