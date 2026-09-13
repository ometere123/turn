import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import type { MerchantCounter, TurnReceipt } from '../types.ts'
import { deleteCounter, loadCounters, loadReceipts, receiptStorageKey, upsertCounter, upsertReceipt } from './storage.ts'

class MemoryStorage implements Storage {
  protected values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

class ReadOnlyStorage extends MemoryStorage {
  override setItem(): void { throw new Error('storage unavailable') }
  override removeItem(): void { throw new Error('storage unavailable') }
}

let previousStorage: PropertyDescriptor | undefined

beforeEach(() => {
  previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true })
})

afterEach(() => {
  if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage)
  else delete (globalThis as { localStorage?: Storage }).localStorage
})

function counter(id: string, itemName: string, createdAt: number): MerchantCounter {
  return {
    id,
    version: 1,
    merchantName: 'Loop Coffee',
    itemName,
    merchantAddress: 'NQ1200000000000000000000000000000000',
    depositLuna: 100_000,
    createdAt,
  }
}

function receipt(txHash: string): TurnReceipt {
  return {
    version: 1,
    txHash,
    nonce: 'abcdefghijklmnopqrstuv',
    merchantName: 'Loop Coffee',
    itemName: 'Reusable cup',
    merchantAddress: 'NQ1200000000000000000000000000000000',
    depositLuna: 100_000,
    refundAddress: 'NQ34AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    createdAt: 1,
    status: 'active',
  }
}

test('multiple counters are stored independently', () => {
  upsertCounter(counter('cup', 'Reusable cup', 1))
  const counters = upsertCounter(counter('box', 'Lunch box', 2))
  assert.equal(counters.length, 2)
  assert.deepEqual(counters.map((item) => item.id), ['box', 'cup'])
})

test('updating one counter does not overwrite the others', () => {
  upsertCounter(counter('cup', 'Reusable cup', 1))
  upsertCounter(counter('box', 'Lunch box', 2))
  const counters = upsertCounter({ ...counter('cup', 'Large reusable cup', 1), depositLuna: 200_000 })
  assert.equal(counters.length, 2)
  assert.equal(counters.find((item) => item.id === 'cup')?.itemName, 'Large reusable cup')
  assert.equal(counters.find((item) => item.id === 'box')?.itemName, 'Lunch box')
})

test('deleting one counter leaves the rest intact', () => {
  upsertCounter(counter('cup', 'Reusable cup', 1))
  upsertCounter(counter('box', 'Lunch box', 2))
  const counters = deleteCounter('cup')
  assert.deepEqual(counters.map((item) => item.id), ['box'])
})

test('legacy single-counter storage migrates into the counter collection', () => {
  localStorage.setItem('turn:counter:v1', JSON.stringify({
    version: 1,
    merchantName: 'Legacy Cafe',
    itemName: 'Cup',
    merchantAddress: 'NQ1200000000000000000000000000000000',
    depositLuna: 50_000,
    createdAt: 42,
  }))
  const counters = loadCounters()
  assert.equal(counters.length, 1)
  assert.equal(counters[0]?.merchantName, 'Legacy Cafe')
  assert.match(counters[0]?.id ?? '', /^legacy-/)
  assert.equal(localStorage.getItem('turn:counter:v1'), null)
})

test('mainnet and testnet receipts use different local storage namespaces', () => {
  assert.equal(receiptStorageKey(''), 'turn:receipts:v2:mainnet')
  assert.equal(receiptStorageKey('?network=testnet'), 'turn:receipts:v2:testnet')
  assert.notEqual(receiptStorageKey(''), receiptStorageKey('?network=testnet'))
})

test('legacy receipts migrate only into the mainnet namespace', () => {
  const legacyReceipt = receipt('a'.repeat(64))
  localStorage.setItem('turn:receipts:v1', JSON.stringify([legacyReceipt]))
  const receipts = loadReceipts()
  assert.equal(receipts.length, 1)
  assert.equal(receipts[0]?.txHash, legacyReceipt.txHash)
  assert.equal(localStorage.getItem('turn:receipts:v1'), null)
  assert.ok(localStorage.getItem('turn:receipts:v2:mainnet'))
})

test('malformed persisted receipts are ignored instead of reaching the UI', () => {
  const valid = receipt('b'.repeat(64))
  const invalidAmount = { ...receipt('c'.repeat(64)), depositLuna: -1 }
  const invalidHash = { ...receipt('d'.repeat(64)), txHash: 'not-a-hash' }
  const invalidAddress = { ...receipt('e'.repeat(64)), refundAddress: 'not-an-address' }
  localStorage.setItem(receiptStorageKey(), JSON.stringify([valid, invalidAmount, invalidHash, invalidAddress]))

  const receipts = loadReceipts()
  assert.equal(receipts.length, 1)
  assert.equal(receipts[0]?.txHash, valid.txHash)
})

test('receipt updates remain usable when local storage writes fail', () => {
  Object.defineProperty(globalThis, 'localStorage', { value: new ReadOnlyStorage(), configurable: true })
  const active = receipt('f'.repeat(64))

  assert.doesNotThrow(() => upsertReceipt(active))
  assert.equal(upsertReceipt(active)[0]?.txHash, active.txHash)
})
