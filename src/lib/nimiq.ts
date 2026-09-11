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
      if (NETWORK === 'TestAlbatross') config.syncMode('pico')
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
  const provider = await getProvider()
  const result = await provider.sendBasicTransactionWithData({
    recipient: counter.merchantAddress,
    value: counter.depositLuna,
    data: depositMemo(nonce),
  })
  if (typeof result !== 'string') throw providerResponseError(result, 'Deposit request failed.')
  return result
}

export async function sendRefund(deposit: VerifiedDeposit): Promise<string> {
  await waitForWalletConsensus()
  const provider = await getProvider()
  const result = await provider.sendBasicTransactionWithData({
    recipient: deposit.sender,
    value: deposit.valueLuna,
    data: refundMemo(deposit.nonce),
  })
  if (typeof result !== 'string') throw providerResponseError(result, 'Refund request failed.')
  return result
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
      && tx.valid
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
        if (!tx.valid || tx.executionResult === false) throw new Error('The transaction was included but is not valid.')
        if (tx.network && normaliseNetwork(tx.network) !== normaliseNetwork(NETWORK)) throw new Error('The transaction is on the wrong Nimiq network.')
        return tx
      }
    } catch (error) {
      lastError = error
    }
    await sleep(1_500)
  }

  if (lastError instanceof Error && /wrong Nimiq network|not valid/i.test(lastError.message)) throw lastError
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

async function waitForClientConsensus(client: Nimiq.Client, timeoutMs: number): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await client.isConsensusEstablished()) return
    await sleep(1_000)
  }
  throw new Error('turn is still syncing with Nimiq. Try this check again shortly.')
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
  return String(tx.state).toLowerCase() === 'included'
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
