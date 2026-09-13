import type { CounterConfig, MerchantCounter, TurnReceipt } from '../types.ts'

const LEGACY_COUNTER_KEY = 'turn:counter:v1'
const COUNTERS_KEY = 'turn:counters:v1'
const LEGACY_RECEIPTS_KEY = 'turn:receipts:v1'
const RECEIPTS_KEY_PREFIX = 'turn:receipts:v2:'
const REFUND_LOCK_PREFIX = 'turn:refund-lock:'
const HASH_RE = /^[0-9a-f]{64}$/i
const NONCE_RE = /^[A-Za-z0-9_-]{12,40}$/
const ADDRESS_RE = /^NQ[0-9]{2}[A-Z0-9]{32}$/

function hasStorage(): boolean {
  return typeof globalThis.localStorage !== 'undefined'
}

function safeSetItem(key: string, value: string): boolean {
  if (!hasStorage()) return false
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

function safeRemoveItem(key: string): void {
  if (!hasStorage()) return
  try {
    localStorage.removeItem(key)
  } catch {
    // Local storage is convenience state only. Never let cleanup break a payment flow.
  }
}

export function receiptStorageKey(search?: string): string {
  const query = search ?? (typeof window !== 'undefined' ? window.location.search : '')
  const network = new URLSearchParams(query).get('network')?.toLowerCase() === 'testnet' ? 'testnet' : 'mainnet'
  return `${RECEIPTS_KEY_PREFIX}${network}`
}

function writeCounters(counters: MerchantCounter[]): MerchantCounter[] {
  const sorted = [...counters].sort((a, b) => b.createdAt - a.createdAt)
  safeSetItem(COUNTERS_KEY, JSON.stringify(sorted))
  return sorted
}

function isCounter(value: unknown): value is CounterConfig {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return record.version === 1
    && typeof record.merchantName === 'string'
    && record.merchantName.trim().length > 0
    && typeof record.itemName === 'string'
    && record.itemName.trim().length > 0
    && typeof record.merchantAddress === 'string'
    && ADDRESS_RE.test(record.merchantAddress.replace(/\s+/g, '').toUpperCase())
    && Number.isSafeInteger(record.depositLuna)
    && Number(record.depositLuna) > 0
    && typeof record.createdAt === 'number'
    && Number.isFinite(record.createdAt)
}

function isMerchantCounter(value: unknown): value is MerchantCounter {
  if (!isCounter(value)) return false
  const id = (value as CounterConfig & { id?: unknown }).id
  return typeof id === 'string' && id.length > 0
}

function isReceipt(value: unknown): value is TurnReceipt {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  const refundAddress = record.refundAddress
  const refundTxHash = record.refundTxHash
  return record.version === 1
    && typeof record.txHash === 'string'
    && HASH_RE.test(record.txHash)
    && typeof record.nonce === 'string'
    && NONCE_RE.test(record.nonce)
    && typeof record.merchantName === 'string'
    && record.merchantName.trim().length > 0
    && typeof record.itemName === 'string'
    && record.itemName.trim().length > 0
    && typeof record.merchantAddress === 'string'
    && ADDRESS_RE.test(record.merchantAddress.replace(/\s+/g, '').toUpperCase())
    && Number.isSafeInteger(record.depositLuna)
    && Number(record.depositLuna) > 0
    && typeof record.createdAt === 'number'
    && Number.isFinite(record.createdAt)
    && (record.status === 'submitted' || record.status === 'active' || record.status === 'refunded')
    && (refundAddress === undefined || (typeof refundAddress === 'string' && ADDRESS_RE.test(refundAddress.replace(/\s+/g, '').toUpperCase())))
    && (refundTxHash === undefined || (typeof refundTxHash === 'string' && HASH_RE.test(refundTxHash)))
}

export function loadCounters(): MerchantCounter[] {
  if (!hasStorage()) return []
  try {
    const stored = localStorage.getItem(COUNTERS_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as unknown
      if (Array.isArray(parsed)) return parsed.filter(isMerchantCounter).sort((a, b) => b.createdAt - a.createdAt)
    }

    const legacy = localStorage.getItem(LEGACY_COUNTER_KEY)
    if (!legacy) return []
    const parsedLegacy = JSON.parse(legacy) as unknown
    if (!isCounter(parsedLegacy)) return []
    const migrated: MerchantCounter = {
      ...parsedLegacy,
      id: `legacy-${parsedLegacy.createdAt}`,
    }
    writeCounters([migrated])
    safeRemoveItem(LEGACY_COUNTER_KEY)
    return [migrated]
  } catch {
    return []
  }
}

export function upsertCounter(counter: MerchantCounter): MerchantCounter[] {
  const counters = loadCounters().filter((item) => item.id !== counter.id)
  counters.push(counter)
  return writeCounters(counters)
}

export function deleteCounter(id: string): MerchantCounter[] {
  return writeCounters(loadCounters().filter((counter) => counter.id !== id))
}

export function loadReceipts(): TurnReceipt[] {
  if (!hasStorage()) return []
  try {
    const key = receiptStorageKey()
    const value = localStorage.getItem(key)
    if (value) {
      const parsed = JSON.parse(value) as unknown
      return Array.isArray(parsed) ? parsed.filter(isReceipt).sort((a, b) => b.createdAt - a.createdAt) : []
    }

    if (key.endsWith(':mainnet')) {
      const legacy = localStorage.getItem(LEGACY_RECEIPTS_KEY)
      if (legacy) {
        const parsed = JSON.parse(legacy) as unknown
        const receipts = Array.isArray(parsed) ? parsed.filter(isReceipt).sort((a, b) => b.createdAt - a.createdAt) : []
        safeSetItem(key, JSON.stringify(receipts.slice(0, 50)))
        safeRemoveItem(LEGACY_RECEIPTS_KEY)
        return receipts
      }
    }
    return []
  } catch {
    return []
  }
}

export function upsertReceipt(receipt: TurnReceipt): TurnReceipt[] {
  const receipts = loadReceipts().filter((item) => item.txHash.toLowerCase() !== receipt.txHash.toLowerCase())
  receipts.unshift(receipt)
  safeSetItem(receiptStorageKey(), JSON.stringify(receipts.slice(0, 50)))
  return receipts
}

export function acquireRefundLock(txHash: string, ttlMs = 120_000): boolean {
  if (!hasStorage()) return true
  const key = `${REFUND_LOCK_PREFIX}${txHash.toLowerCase()}`
  const now = Date.now()
  try {
    const current = Number(localStorage.getItem(key) ?? 0)
    if (current > now) return false
    localStorage.setItem(key, String(now + ttlMs))
    return true
  } catch {
    // The lock is a best-effort same-device guard. Chain reconciliation remains authoritative.
    return true
  }
}

export function releaseRefundLock(txHash: string): void {
  safeRemoveItem(`${REFUND_LOCK_PREFIX}${txHash.toLowerCase()}`)
}
