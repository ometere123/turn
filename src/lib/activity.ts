import type { ChainTransaction, VerifiedDeposit } from '../types.ts'
import { findExistingRefund, getClient } from './nimiq.ts'
import { decodeTransactionData, normaliseAddress, parseDepositMemo, parseDepositRefundAddress } from './protocol.ts'

export interface MerchantActivityRecord {
  deposit: VerifiedDeposit
  refundTxHash?: string
  refunded: boolean
  timestamp?: number
}

export async function loadMerchantActivity(address: string, valueLuna?: number): Promise<MerchantActivityRecord[]> {
  const client = await getClient()
  const started = Date.now()
  while (!(await client.isConsensusEstablished())) {
    if (Date.now() - started > 30_000) throw new Error('turn is still syncing with Nimiq. Try activity again shortly.')
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }

  const merchantAddress = normaliseAddress(address)
  const transactions = (await client.getTransactionsByAddress(merchantAddress)) as unknown as ChainTransaction[]
  const deposits = transactions.filter((tx) => {
    if (String(tx.state).toLowerCase() !== 'confirmed' || tx.executionResult === false) return false
    if (normaliseAddress(tx.recipient) !== merchantAddress) return false
    if (valueLuna !== undefined && tx.value !== valueLuna) return false
    const data = decodeTransactionData(tx.data)
    return Boolean(parseDepositMemo(data) && parseDepositRefundAddress(data))
  })

  const rows = await Promise.all(deposits.slice(0, 30).map(async (tx) => {
    const data = decodeTransactionData(tx.data)
    const nonce = parseDepositMemo(data)!
    const refundAddress = parseDepositRefundAddress(data)!
    const deposit: VerifiedDeposit = {
      txHash: tx.transactionHash.toLowerCase(),
      sender: normaliseAddress(tx.sender),
      recipient: merchantAddress,
      valueLuna: tx.value,
      nonce,
      refundAddress,
      blockHeight: tx.blockHeight,
      confirmations: tx.confirmations,
    }
    const refund = await findExistingRefund(deposit).catch(() => null)
    return {
      deposit,
      refunded: Boolean(refund),
      refundTxHash: refund?.transactionHash?.toLowerCase(),
      timestamp: tx.timestamp,
    } satisfies MerchantActivityRecord
  }))

  return rows.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
}
