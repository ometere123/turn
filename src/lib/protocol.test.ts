import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCounterLink,
  buildReturnLink,
  decodeTransactionData,
  depositMemo,
  lunaToNim,
  nimToLuna,
  normaliseNetwork,
  parseCounterLink,
  parseDepositMemo,
  parseReturnReference,
  refundMemo,
} from './protocol.ts'

const address = 'NQ1200000000000000000000000000000000'

test('NIM and Luna convert exactly up to five decimals', () => {
  assert.equal(nimToLuna('1'), 100_000)
  assert.equal(nimToLuna('1.23456'), 123_456)
  assert.equal(lunaToNim(123_456), '1.23456')
  assert.throws(() => nimToLuna('0'))
  assert.throws(() => nimToLuna('1.000001'))
})

test('deposit and refund memos stay compact and parse safely', () => {
  const nonce = 'abcdefghijklmnopqrstuv'
  assert.equal(parseDepositMemo(depositMemo(nonce)), nonce)
  assert.equal(refundMemo(nonce), `turn:r:${nonce}`)
  assert.equal(parseDepositMemo('hello'), null)
})

test('transaction raw hex data decodes to text', () => {
  const text = 'turn:d:abcdefghijklmnopqrstuv'
  const raw = Buffer.from(text, 'utf8').toString('hex')
  assert.equal(decodeTransactionData({ raw }), text)
})

test('counter links round-trip without trusting local state', () => {
  const link = buildCounterLink('https://turn.example/', {
    version: 1,
    merchantName: 'Loop Coffee',
    itemName: 'Reusable cup',
    merchantAddress: address,
    depositLuna: 100_000,
    createdAt: 1,
  })
  const parsed = parseCounterLink(link)
  assert.equal(parsed.merchantName, 'Loop Coffee')
  assert.equal(parsed.itemName, 'Reusable cup')
  assert.equal(parsed.depositLuna, 100_000)
  assert.equal(parsed.merchantAddress, address)
})

test('testnet mode is preserved in counter and return handoff links', () => {
  const counterLink = buildCounterLink('https://turn.example/?network=testnet', {
    version: 1,
    merchantName: 'Loop Coffee',
    itemName: 'Reusable cup',
    merchantAddress: address,
    depositLuna: 100_000,
    createdAt: 1,
  })
  assert.equal(new URL(counterLink).searchParams.get('network'), 'testnet')

  const returnLink = buildReturnLink('https://turn.example/?network=testnet', 'a'.repeat(64))
  assert.equal(new URL(returnLink).searchParams.get('network'), 'testnet')
})

test('return links only carry the deposit transaction hash as financial authority', () => {
  const hash = 'a'.repeat(64)
  const link = buildReturnLink('https://turn.example/', hash)
  assert.equal(parseReturnReference(link), hash)
  assert.equal(parseReturnReference(hash.toUpperCase()), hash)
})

test('network names tolerate the web-client hyphenated representation', () => {
  assert.equal(normaliseNetwork('main-albatross'), normaliseNetwork('MainAlbatross'))
})
