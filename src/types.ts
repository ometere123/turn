export type TurnMode = 'customer' | 'merchant'

export interface CounterConfig {
  version: 1
  merchantName: string
  itemName: string
  merchantAddress: string
  depositLuna: number
  createdAt: number
}

export type ReceiptStatus = 'submitted' | 'active' | 'refunded'

export interface TurnReceipt {
  version: 1
  txHash: string
  nonce: string
  merchantName: string
  itemName: string
  merchantAddress: string
  depositLuna: number
  createdAt: number
  status: ReceiptStatus
  refundTxHash?: string
}

export interface ChainTransaction {
  transactionHash: string
  sender: string
  recipient: string
  value: number
  data: unknown
  network: string
  state: string
  valid?: boolean
  executionResult?: boolean
  blockHeight?: number
  confirmations?: number
  timestamp?: number
}

export interface VerifiedDeposit {
  txHash: string
  sender: string
  recipient: string
  valueLuna: number
  nonce: string
  blockHeight?: number
  confirmations?: number
}
