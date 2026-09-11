import type { CounterConfig, MerchantCounter, TurnReceipt } from '../types.ts'

const LEGACY_COUNTER_KEY = 'turn:counter:v1'
const COUNTERS_KEY = 'turn:counters:v1'
const RECEIPTS_KEY = 'turn:receipts:v1'
const REFUND_LOCK_PREFIX = 'turn:refund-lock:'

function hasStorage(): boolean {
  return typeof globalThis.localStorage !== 'undefined'
}

function writeCounters(counters: MerchantCounter[]): MerchantCounter[] {
  const sorted = [...counters].sort((a, b) => b.createdAt - a.createdAt)
  if (hasStorage()) localStorage.setItem(COUNTERS_KEY, JSON.stringify(sorted))
  return sorted
}

function isCounter(value: unknown): value is CounterConfig {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return record.version === 1
    && typeof record.merchantName === 'string'
    && typeof record.itemName === 'string'
    && typeof record.merchantAddress === 'string'
    && Number.isSafeInteger(record.depositLuna)
    && typeof record.createdAt === 'number'
}

function isMerchantCounter(value: unknown): value is MerchantCounter {
  if (!isCounter(value)) return false
  const id = (value as CounterConfig & { id?: unknown }).id
  return typeof id === 'string' && id.length > 0
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
    localStorage.removeItem(LEGACY_COUNTER_KEY)
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
