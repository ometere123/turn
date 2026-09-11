import type { CounterConfig } from '../types.ts'

export const LUNA_PER_NIM = 100_000
export const DEPOSIT_PREFIX = 'turn:d:'
export const REFUND_PREFIX = 'turn:r:'
const HASH_RE = /^[0-9a-f]{64}$/i
const ADDRESS_RE = /^NQ[0-9]{2}[A-Z0-9]{32}$/

export function normaliseNetwork(network: string): string {
  return network.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function normaliseAddress(address: string): string {
  return address.replace(/\s+/g, '').toUpperCase()
}

export function looksLikeNimiqAddress(address: string): boolean {
  return ADDRESS_RE.test(normaliseAddress(address))
}

export function nimToLuna(input: string | number): number {
  const text = String(input).trim()
  if (!/^\d+(\.\d{1,5})?$/.test(text)) throw new Error('Enter a valid NIM amount with up to 5 decimals.')
  const [whole, fraction = ''] = text.split('.')
  const luna = Number(whole) * LUNA_PER_NIM + Number((fraction + '00000').slice(0, 5))
  if (!Number.isSafeInteger(luna) || luna <= 0) throw new Error('Deposit amount must be greater than 0 NIM.')
  return luna
}

export function lunaToNim(luna: number): string {
  if (!Number.isSafeInteger(luna) || luna < 0) throw new Error('Invalid Luna amount.')
  const whole = Math.floor(luna / LUNA_PER_NIM)
  const fraction = String(luna % LUNA_PER_NIM).padStart(5, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : String(whole)
}

export function newNonce(bytes = 16): string {
  const data = new Uint8Array(bytes)
  const cryptoApi = globalThis.crypto
  if (!cryptoApi?.getRandomValues) throw new Error('Secure randomness is unavailable in this browser.')
  cryptoApi.getRandomValues(data)
  return toBase64Url(data)
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  if (typeof btoa !== 'function') throw new Error('Base64 encoding is unavailable in this browser.')
  const base64 = btoa(binary)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function depositMemo(nonce: string): string {
  const value = `${DEPOSIT_PREFIX}${nonce}`
  if (new TextEncoder().encode(value).length > 64) throw new Error('Deposit memo is too large.')
  return value
}

export function refundMemo(nonce: string): string {
  const value = `${REFUND_PREFIX}${nonce}`
  if (new TextEncoder().encode(value).length > 64) throw new Error('Refund memo is too large.')
  return value
}

export function parseDepositMemo(value: string): string | null {
  if (!value.startsWith(DEPOSIT_PREFIX)) return null
  const nonce = value.slice(DEPOSIT_PREFIX.length)
  return /^[A-Za-z0-9_-]{16,40}$/.test(nonce) ? nonce : null
}

export function decodeTransactionData(data: unknown): string {
  if (typeof data === 'string') return data
  if (data instanceof Uint8Array) return new TextDecoder().decode(data)
  if (Array.isArray(data) && data.every((value) => Number.isInteger(value))) {
    return new TextDecoder().decode(Uint8Array.from(data as number[]))
  }
  if (data && typeof data === 'object' && 'raw' in data) {
    const raw = (data as { raw?: unknown }).raw
    if (typeof raw !== 'string') return ''
    if (raw.length % 2 === 0 && /^[0-9a-f]*$/i.test(raw)) {
      const bytes = new Uint8Array(raw.length / 2)
      for (let i = 0; i < raw.length; i += 2) bytes[i / 2] = Number.parseInt(raw.slice(i, i + 2), 16)
      return new TextDecoder().decode(bytes)
    }
    return raw
  }
  return ''
}

function turnUrl(origin: string): URL {
  const url = new URL(origin)
  const pageNetwork = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('network') : null
  const requestedNetwork = url.searchParams.get('network') ?? pageNetwork
  const testnet = requestedNetwork?.toLowerCase() === 'testnet'
  url.search = ''
  url.hash = ''
  if (testnet) url.searchParams.set('network', 'testnet')
  return url
}

export function buildCounterLink(origin: string, counter: CounterConfig): string {
  const url = turnUrl(origin)
  url.searchParams.set('turn', 'counter')
  url.searchParams.set('v', '1')
  url.searchParams.set('a', normaliseAddress(counter.merchantAddress))
  url.searchParams.set('n', counter.merchantName)
  url.searchParams.set('i', counter.itemName)
  url.searchParams.set('l', String(counter.depositLuna))
  return url.toString()
}

export function parseCounterLink(input: string): CounterConfig {
  const url = parseUrlLike(input)
  if (url.searchParams.get('turn') !== 'counter' || url.searchParams.get('v') !== '1') {
    throw new Error('This is not a turn counter link.')
  }
  const merchantAddress = normaliseAddress(url.searchParams.get('a') ?? '')
  const merchantName = cleanLabel(url.searchParams.get('n') ?? '', 40, 'merchant name')
  const itemName = cleanLabel(url.searchParams.get('i') ?? '', 40, 'item name')
  const depositLuna = Number(url.searchParams.get('l'))
  if (!looksLikeNimiqAddress(merchantAddress)) throw new Error('The counter contains an invalid Nimiq address.')
  if (!Number.isSafeInteger(depositLuna) || depositLuna <= 0) throw new Error('The counter contains an invalid deposit amount.')
  return { version: 1, merchantAddress, merchantName, itemName, depositLuna, createdAt: Date.now() }
}

export function buildReturnLink(origin: string, txHash: string): string {
  assertTxHash(txHash)
  const url = turnUrl(origin)
  url.searchParams.set('turn', 'return')
  url.searchParams.set('tx', txHash.toLowerCase())
  return url.toString()
}

export function parseReturnReference(input: string): string {
  const trimmed = input.trim()
  if (HASH_RE.test(trimmed)) return trimmed.toLowerCase()
  const url = parseUrlLike(trimmed)
  if (url.searchParams.get('turn') !== 'return') throw new Error('This is not a turn return receipt.')
  const hash = url.searchParams.get('tx') ?? ''
  assertTxHash(hash)
  return hash.toLowerCase()
}

export function assertTxHash(hash: string): void {
  if (!HASH_RE.test(hash)) throw new Error('The transaction hash is invalid.')
}

function parseUrlLike(input: string): URL {
  const trimmed = input.trim()
  try {
    return new URL(trimmed)
  } catch {
    throw new Error('Paste a valid turn link.')
  }
}

function cleanLabel(value: string, maxLength: number, label: string): string {
  const clean = value.replace(/\s+/g, ' ').trim()
  if (!clean || clean.length > maxLength) throw new Error(`The ${label} is invalid.`)
  return clean
}
