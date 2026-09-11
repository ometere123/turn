import * as Nimiq from '@nimiq/core'
import { init } from '@nimiq/mini-app-sdk'
import type { ChainTransaction, CounterConfig, VerifiedDeposit } from '../types.ts'
import {
  decodeTransactionData,
  depositMemo,
  normaliseAddress,
  normaliseNetwork,
  parseDepositMemo,
  refundMemo,
} from './protocol.ts'

const configuredNetwork = import.meta.env.VITE_NIMIQ_NETWORK ?? 'MainAlbatross'
const requestedNetwork = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('network') : null
export const NETWORK = requestedNetwork?.toLowerCase() === 'testnet' ? 'TestAlbatross' : configuredNetwork

const TESTNET_SEEDS = [
  '/dns4/seed1.pos.nimiq-testnet.com/tcp/8443/wss',
  '/dns4/seed2.pos.nimiq-testnet.com/tcp/8443/wss',
  '/dns4/seed3.pos.nimiq-testnet.com/tcp/8443/wss',
  '/dns4/seed4.pos.nimiq-testnet.com/tcp/8443/wss',
]

const SEND_GUARD_PREFIX = 'turn:send-guard:v1:'
const SEND_GUARD_TTL_MS = 10 * 60 * 1_000

let providerPromise: ReturnType<typeof init> | null = null
let clientPromise: Promise<Nimiq.Client> | null = null

export function getProvider() {
  providerPromise ??= init({ timeout: 5_000 }).catch((error) => {
    providerPromise = null
    throw error
  })
  return providerPromise
}

export async function listAccounts(): Promise<string[]> {
  const provider = await getProvider()
  const accounts = await provider.listAccounts()
  if (!Array.isArray(accounts)) throw providerResponseError(accounts, 'Wallet account access failed.')
  return accounts.map(normaliseAddress)
}

export async function waitForWalletConsensus(timeoutMs = 20_000): Promise<void> {
  const provider = await getProvider()
  const started = Date.now()
  let lastError: unknown

  while (Date.now() - started < timeoutMs) {
    try {
      if (await provider.isConsensusEstablished()) return
    } catch (error) {
      lastError = error
    }
    await sleep(1_000)
  }

  if (lastError instanceof Error && lastError.message.trim()) throw lastError
  throw new Error(
    NETWORK === 'TestAlbatross'
      ? 'Nimiq Pay is still syncing Testnet. Return to the wallet home, wait until your test NIM balance is visible, then try again.'
      : 'Nimiq Pay is still syncing. Return to the wallet home, wait for the account to finish syncing, then try again.',
  )
}

export async function getClient(): Promise<Nimiq.Client> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const config = new Nimiq.ClientConfiguration()
      config.network(NETWORK)
      config.logLevel('warn')
      if (NETWORK === 'TestAlbatross') {
        config.syncMode('pico')
        config.seedNodes(TESTNET_SEEDS)
      }
      return Nimiq.Client.create(config.build())
    })().catch((error) => {
      clientPromise = null
      throw error
    })
  }
  return clientPromise
}

export async function sendDeposit(counter: CounterConfig, nonce: string): Promise<string> {
  await waitForWalletConsensus()
  const guardKey = depositGuardKey(counter)
  beginSendGuard(guardKey, 'A recent deposit for this counter may already exist. Check My returns or the merchant wallet before paying again.')

  try {
    const provider = await getProvider()
    let result: unknown
    try {
      result = await provider.sendBasicTransactionWithData({
        recipient: counter.merchantAddress,
        value: counter.depositLuna,
        data: depositMemo(nonce),
      })
    } catch (error) {
      if (isUserCancellation(error)) {
        clearSendGuard(guardKey)
        throw error
      }
      const recovered = await reconcileDeposit(counter, nonce)
      if (recovered) {
        finishSendGuard(guardKey, recovered.transactionHash)
        return recovered.transactionHash.toLowerCase()
      }
      throw new Error('Payment outcome could not be confirmed. Do not pay again yet. Check the merchant wallet; if the NIM arrived, recover the payment by transaction hash.')
    }

    if (typeof result === 'string') {
      finishSendGuard(guardKey, result)
      return result
    }

    const responseError = providerResponseError(result, 'Deposit request failed.')
    if (isUserCancellation(responseError)) {
      clearSendGuard(guardKey)
      throw responseError
    }
    const recovered = await reconcileDeposit(counter, nonce)
    if (recovered) {
      finishSendGuard(guardKey, recovered.transactionHash)
      return recovered.transactionHash.toLowerCase()
    }
    throw new Error('Payment outcome could not be confirmed. Do not pay again yet. Check the merchant wallet; if the NIM arrived, recover the payment by transaction hash.')
  } catch (error) {
    if (isUserCancellation(error)) clearSendGuard(guardKey)
    throw error
  }
}

export async function sendRefund(deposit: VerifiedDeposit): Promise<string> {
  await waitForWalletConsensus()
  const guardKey = refundGuardKey(deposit)
  beginSendGuard(guardKey, 'A refund for this deposit may already have been sent. Check its status before trying again.')

  try {
    const provider = await getProvider()
    let result: unknown
    try {
      result = await provider.sendBasicTransactionWithData({
        recipient: deposit.sender,
        value: deposit.valueLuna,
        fee: 0,
        data: refundMemo(deposit.nonce),
      })
    } catch (error) {
      if (isUserCancellation(error)) {
        clearSendGuard(guardKey)
        throw error
      }
      const recovered = await reconcileRefund(deposit)
      if (recovered) {
        finishSendGuard(guardKey, recovered.transactionHash)
        return recovered.transactionHash.toLowerCase()
      }
      throw new Error('Refund outcome could not be confirmed. Do not send another refund yet. Check the customer wallet and then check this deposit again.')
    }

    if (typeof result === 'string') {
      finishSendGuard(guardKey, result)
      return result
    }

    const responseError = providerResponseError(result, 'Refund request failed.')
    if (isUserCancellation(responseError)) {
      clearSendGuard(guardKey)
      throw responseError
    }
    const recovered = await reconcileRefund(deposit)
    if (recovered) {
      finishSendGuard(guardKey, recovered.transactionHash)
      return recovered.transactionHash.toLowerCase()
    }
    throw new Error('Refund outcome could not be confirmed. Do not send another refund yet. Check the customer wallet and then check this deposit again.')
  } catch (error) {
    if (isUserCancellation(error)) clearSendGuard(guardKey)
    throw error
  }
}

export async function waitForDeposit(
  txHash: string,
  expected?: { recipient?: string; valueLuna?: number; nonce?: string },
  timeoutMs = 90_000,
): Promise<VerifiedDeposit> {
  const tx = await waitForIncludedTransaction(txHash, timeoutMs)
  const data = decodeTransactionData(tx.data)
  const nonce = parseDepositMemo(data)
  if (!nonce) throw new Error('This transaction is not a turn deposit.')
  if (expected?.recipient && normaliseAddress(tx.recipient) !== normaliseAddress(expected.recipient)) {
    throw new Error('The payment recipient does not match this counter.')
  }
  if (expected?.valueLuna !== undefined && tx.value !== expected.valueLuna) {
    throw new Error('The payment amount does not match this deposit.')
  }
  if (expected?.nonce && nonce !== expected.nonce) {
    throw new Error('The payment receipt does not match this deposit attempt.')
  }
  return {
    txHash: tx.transactionHash.toLowerCase(),
    sender: normaliseAddress(tx.sender),
    recipient: normaliseAddress(tx.recipient),
    valueLuna: tx.value,
    nonce,
    blockHeight: tx.blockHeight,
    confirmations: tx.confirmations,
  }
}

export async function findExistingRefund(deposit: VerifiedDeposit): Promise<ChainTransaction | null> {
  const client = await getClient()
  await waitForClientConsensus(client, 30_000)
  const transactions = (await client.getTransactionsByAddress(deposit.sender)) as unknown as ChainTransaction[]
  const expectedData = refundMemo(deposit.nonce)
  return (
    transactions.find((tx) =>
      isIncluded(tx)
      && tx.executionResult !== false
      && normaliseAddress(tx.recipient) === normaliseAddress(deposit.sender)
      && tx.value === deposit.valueLuna
      && decodeTransactionData(tx.data) === expectedData,
    ) ?? null
  )
}

export async function waitForRefund(
  txHash: string,
  deposit: VerifiedDeposit,
  timeoutMs = 90_000,
): Promise<ChainTransaction> {
  const tx = await waitForIncludedTransaction(txHash, timeoutMs)
  const expectedData = refundMemo(deposit.nonce)
  if (normaliseAddress(tx.recipient) !== normaliseAddress(deposit.sender)) throw new Error('The refund recipient does not match the original customer.')
  if (tx.value !== deposit.valueLuna) throw new Error('The refund amount does not match the original deposit.')
  if (decodeTransactionData(tx.data) !== expectedData) throw new Error('The refund marker does not match the original deposit.')
  return tx
}

export async function waitForIncludedTransaction(txHash: string, timeoutMs = 90_000): Promise<ChainTransaction> {
  const client = await getClient()
  const started = Date.now()
  let lastError: unknown
  let reachedConsensus = false

  while (Date.now() - started < timeoutMs) {
    try {
      if (!(await client.isConsensusEstablished())) {
        await sleep(1_000)
        continue
      }
      reachedConsensus = true
      const tx = (await client.getTransaction(txHash)) as unknown as ChainTransaction
      if (isIncluded(tx)) {
        if (tx.executionResult === false) throw new Error(`Transaction ${txHash.toLowerCase()} was included but execution failed.`)
        if (tx.network && normaliseNetwork(tx.network) !== normaliseNetwork(NETWORK)) throw new Error('The transaction is on the wrong Nimiq network.')
        return tx
      }
    } catch (error) {
      lastError = error
    }
    await sleep(1_500)
  }

  if (lastError instanceof Error && /wrong Nimiq network|execution failed/i.test(lastError.message)) throw lastError
  if (!reachedConsensus) {
    throw new Error('turn is still syncing with Nimiq. Your submitted payment is saved; keep this screen open or tap Check status again shortly.')
  }
  throw new Error('The transaction is not confirmed yet. Your receipt is saved; tap Check status again shortly.')
}

export async function validateAddress(address: string): Promise<boolean> {
  try {
    Nimiq.Address.fromUserFriendlyAddress(address)
    return true
  } catch {
    return false
  }
}

async function reconcileDeposit(counter: CounterConfig, nonce: string, timeoutMs = 20_000): Promise<ChainTransaction | null> {
  const expectedData = depositMemo(nonce)
  return findMatchingTransaction(counter.merchantAddress, timeoutMs, (tx) =>
    normaliseAddress(tx.recipient) === normaliseAddress(counter.merchantAddress)
    && tx.value === counter.depositLuna
    && decodeTransactionData(tx.data) === expectedData,
  )
}

async function reconcileRefund(deposit: VerifiedDeposit, timeoutMs = 20_000): Promise<ChainTransaction | null> {
  const expectedData = refundMemo(deposit.nonce)
  return findMatchingTransaction(deposit.sender, timeoutMs, (tx) =>
    normaliseAddress(tx.recipient) === normaliseAddress(deposit.sender)
    && tx.value === deposit.valueLuna
    && decodeTransactionData(tx.data) === expectedData,
  )
}

async function findMatchingTransaction(
  address: string,
  timeoutMs: number,
  matches: (tx: ChainTransaction) => boolean,
): Promise<ChainTransaction | null> {
  try {
    const client = await getClient()
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      if (await client.isConsensusEstablished()) {
        const transactions = (await client.getTransactionsByAddress(address)) as unknown as ChainTransaction[]
        const match = transactions.find((tx) => isIncluded(tx) && tx.executionResult !== false && matches(tx))
        if (match) return match
      }
      await sleep(1_000)
    }
  } catch {
    // Reconciliation is best-effort. The send guard remains in place on an ambiguous outcome.
  }
  return null
}

async function waitForClientConsensus(client: Nimiq.Client, timeoutMs: number): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await client.isConsensusEstablished()) return
    await sleep(1_000)
  }
  throw new Error('turn is still syncing with Nimiq. Try this check again shortly.')
}

function depositGuardKey(counter: CounterConfig): string {
  const item = counter.itemName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32)
  return `${SEND_GUARD_PREFIX}${normaliseNetwork(NETWORK)}:deposit:${normaliseAddress(counter.merchantAddress)}:${counter.depositLuna}:${item}`
}

function refundGuardKey(deposit: VerifiedDeposit): string {
  return `${SEND_GUARD_PREFIX}${normaliseNetwork(NETWORK)}:refund:${deposit.txHash.toLowerCase()}`
}

function beginSendGuard(key: string, message: string): void {
  if (typeof globalThis.localStorage === 'undefined') return
  const now = Date.now()
  try {
    const current = JSON.parse(localStorage.getItem(key) ?? 'null') as { expiresAt?: number } | null
    if (current?.expiresAt && current.expiresAt > now) throw new Error(message)
  } catch (error) {
    if (error instanceof Error && error.message === message) throw error
  }
  localStorage.setItem(key, JSON.stringify({ expiresAt: now + SEND_GUARD_TTL_MS }))
}

function finishSendGuard(key: string, txHash: string): void {
  if (typeof globalThis.localStorage === 'undefined') return
  localStorage.setItem(key, JSON.stringify({ expiresAt: Date.now() + SEND_GUARD_TTL_MS, txHash: txHash.toLowerCase() }))
}

function clearSendGuard(key: string): void {
  if (typeof globalThis.localStorage === 'undefined') return
  localStorage.removeItem(key)
}

function isUserCancellation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const name = error && typeof error === 'object' && 'name' in error ? String((error as { name?: unknown }).name) : ''
  return /PermissionDenied|denied|reject|cancel/i.test(`${name} ${message}`)
}

function providerResponseError(response: unknown, fallback: string): Error {
  if (response && typeof response === 'object') {
    const record = response as Record<string, unknown>
    const message = [record.message, record.error, record.code].find((value) => typeof value === 'string')
    if (typeof message === 'string' && message.trim()) return new Error(message)
  }
  return new Error(fallback)
}

function isIncluded(tx: ChainTransaction): boolean {
  const state = String(tx.state).toLowerCase()
  return state === 'included' || state === 'confirmed' || state === 'mined'
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
