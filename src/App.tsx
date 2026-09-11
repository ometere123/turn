import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Coins,
  Copy,
  ExternalLink,
  History,
  LoaderCircle,
  PackageCheck,
  QrCode,
  RefreshCw,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  Store,
  Undo2,
  WalletCards,
  XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { QrPanel } from './components/QrPanel.tsx'
import { copyText } from './lib/browser.ts'
import { ScannerModal } from './components/ScannerModal.tsx'
import {
  NETWORK,
  findExistingRefund,
  getClient,
  getProvider,
  listAccounts,
  sendDeposit,
  sendRefund,
  validateAddress,
  waitForDeposit,
  waitForRefund,
} from './lib/nimiq.ts'
import {
  buildCounterLink,
  buildReturnLink,
  lunaToNim,
  newNonce,
  nimToLuna,
  normaliseAddress,
  parseCounterLink,
  parseReturnReference,
} from './lib/protocol.ts'
import {
  acquireRefundLock,
  loadCounter,
  loadReceipts,
  releaseRefundLock,
  saveCounter,
  upsertReceipt,
} from './lib/storage.ts'
import type { CounterConfig, TurnMode, TurnReceipt, VerifiedDeposit } from './types.ts'

type ProviderState = 'checking' | 'ready' | 'outside'
type BusyState = 'idle' | 'wallet' | 'chain' | 'refund-wallet' | 'refund-chain'

interface ReturnReview {
  deposit: VerifiedDeposit
  alreadyRefunded: boolean
  refundTxHash?: string
}

const APP_BASE = new URL(import.meta.env.BASE_URL, window.location.origin).toString()

export function App() {
  const [mode, setMode] = useState<TurnMode>('customer')
  const [providerState, setProviderState] = useState<ProviderState>('checking')
  const [counter, setCounter] = useState<CounterConfig | null>(null)
  const [merchantCounter, setMerchantCounter] = useState<CounterConfig | null>(() => loadCounter())
  const [merchantAccounts, setMerchantAccounts] = useState<string[]>([])
  const [receipts, setReceipts] = useState<TurnReceipt[]>(() => loadReceipts())
  const [selectedReceipt, setSelectedReceipt] = useState<TurnReceipt | null>(null)
  const [returnReview, setReturnReview] = useState<ReturnReview | null>(null)
  const [busy, setBusy] = useState<BusyState>('idle')
  const [notice, setNotice] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [scanner, setScanner] = useState<'counter' | 'return' | null>(null)
  const [showSetup, setShowSetup] = useState(false)
  const [merchantName, setMerchantName] = useState(merchantCounter?.merchantName ?? '')
  const [itemName, setItemName] = useState(merchantCounter?.itemName ?? 'Reusable cup')
  const [depositNim, setDepositNim] = useState(merchantCounter ? lunaToNim(merchantCounter.depositLuna) : '1')
  const [selectedAccount, setSelectedAccount] = useState(merchantCounter?.merchantAddress ?? '')

  const merchantConnected = useMemo(
    () => merchantAccounts.some((account) => normaliseAddress(account) === normaliseAddress(merchantCounter?.merchantAddress ?? '')),
    [merchantAccounts, merchantCounter],
  )

  const clearMessages = useCallback(() => {
    setError('')
    setNotice('')
  }, [])

  useEffect(() => {
    getProvider().then(() => setProviderState('ready')).catch(() => setProviderState('outside'))
    void getClient().catch(() => undefined)

    const url = window.location.href
    try {
      const current = new URL(url)
      const target = current.searchParams.get('turn')
      if (target === 'counter') {
        setCounter(parseCounterLink(url))
        setMode('customer')
      } else if (target === 'return') {
        setMode('merchant')
        setScanner(null)
        window.setTimeout(() => void reviewReturn(url), 0)
      }
    } catch (caught) {
      setError(messageFrom(caught))
    }
    // URL parsing is intentionally mount-only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function openMerchantSession() {
    clearMessages()
    setBusy('wallet')
    try {
      const accounts = await listAccounts()
      setMerchantAccounts(accounts)
      if (!selectedAccount) setSelectedAccount(accounts[0] ?? '')
      if (accounts.length === 0) throw new Error('No Nimiq account is available in Nimiq Pay.')
      setNotice('Merchant wallet authorised for this session.')
    } catch (caught) {
      setError(walletMessage(caught, 'Wallet access'))
    } finally {
      setBusy('idle')
    }
  }

  async function saveMerchantSetup(event: React.FormEvent) {
    event.preventDefault()
    clearMessages()
    try {
      const cleanMerchant = merchantName.replace(/\s+/g, ' ').trim()
      const cleanItem = itemName.replace(/\s+/g, ' ').trim()
      if (!cleanMerchant || cleanMerchant.length > 40) throw new Error('Use a merchant name between 1 and 40 characters.')
      if (!cleanItem || cleanItem.length > 40) throw new Error('Use an item name between 1 and 40 characters.')
      if (!selectedAccount) throw new Error('Choose the Nimiq account that will receive deposits.')
      if (!(await validateAddress(selectedAccount))) throw new Error('The selected Nimiq address is invalid.')
      const next: CounterConfig = {
        version: 1,
        merchantName: cleanMerchant,
        itemName: cleanItem,
        merchantAddress: normaliseAddress(selectedAccount),
        depositLuna: nimToLuna(depositNim),
        createdAt: merchantCounter?.createdAt ?? Date.now(),
      }
      saveCounter(next)
      setMerchantCounter(next)
      setShowSetup(false)
      setNotice('Counter ready. Customers can scan it now.')
    } catch (caught) {
      setError(messageFrom(caught))
    }
  }

  async function payDeposit() {
    if (!counter || busy !== 'idle') return
    clearMessages()
    if (providerState !== 'ready') {
      setError('Open turn inside Nimiq Pay to approve a deposit.')
      return
    }
    setBusy('wallet')
    const nonce = newNonce()
    let submitted = false
    try {
      if (!(await validateAddress(counter.merchantAddress))) throw new Error('This counter has an invalid Nimiq address.')
      const txHash = await sendDeposit(counter, nonce)
      submitted = true
      const receipt: TurnReceipt = {
        version: 1,
        txHash: txHash.toLowerCase(),
        nonce,
        merchantName: counter.merchantName,
        itemName: counter.itemName,
        merchantAddress: counter.merchantAddress,
        depositLuna: counter.depositLuna,
        createdAt: Date.now(),
        status: 'submitted',
      }
      setReceipts(upsertReceipt(receipt))
      setSelectedReceipt(receipt)
      setBusy('chain')
      const verified = await waitForDeposit(txHash, {
        recipient: counter.merchantAddress,
        valueLuna: counter.depositLuna,
        nonce,
      })
      const active = { ...receipt, txHash: verified.txHash, status: 'active' as const }
      setReceipts(upsertReceipt(active))
      setSelectedReceipt(active)
      setNotice('Deposit confirmed. Keep this return receipt.')
    } catch (caught) {
      if (submitted) setNotice('Your submitted payment is saved. You can check it again from My returns.')
      setError(walletMessage(caught, 'Payment'))
    } finally {
      setBusy('idle')
    }
  }

  async function refreshReceipt(receipt: TurnReceipt) {
    clearMessages()
    setBusy('chain')
    try {
      const deposit = await waitForDeposit(receipt.txHash, {
        recipient: receipt.merchantAddress,
        valueLuna: receipt.depositLuna,
        nonce: receipt.nonce,
      }, 20_000)
      const refund = await findExistingRefund(deposit)
      const next: TurnReceipt = {
        ...receipt,
        status: refund ? 'refunded' : 'active',
        refundTxHash: refund?.transactionHash?.toLowerCase(),
      }
      setReceipts(upsertReceipt(next))
      setSelectedReceipt(next)
      setNotice(refund ? 'Refund confirmed on Nimiq.' : 'Deposit is active and ready to return.')
    } catch (caught) {
      setError(messageFrom(caught))
    } finally {
      setBusy('idle')
    }
  }

  async function recoverReceipt(reference: string) {
    clearMessages()
    setBusy('chain')
    try {
      const txHash = parseReturnReference(reference)
      const deposit = await waitForDeposit(txHash, undefined, 20_000)
      const refund = await findExistingRefund(deposit)
      const known = receipts.find((receipt) => receipt.txHash === deposit.txHash)
      const receipt: TurnReceipt = known ?? {
        version: 1,
        txHash: deposit.txHash,
        nonce: deposit.nonce,
        merchantName: 'turn merchant',
        itemName: 'Returnable item',
        merchantAddress: deposit.recipient,
        depositLuna: deposit.valueLuna,
        createdAt: Date.now(),
        status: refund ? 'refunded' : 'active',
        refundTxHash: refund?.transactionHash?.toLowerCase(),
      }
      setReceipts(upsertReceipt(receipt))
      setSelectedReceipt(receipt)
    } catch (caught) {
      setError(messageFrom(caught))
    } finally {
      setBusy('idle')
    }
  }

  async function reviewReturn(reference: string) {
    clearMessages()
    setBusy('chain')
    setReturnReview(null)
    try {
      if (providerState === 'outside') throw new Error('Open turn inside Nimiq Pay to process a return.')
      let accounts = merchantAccounts
      if (accounts.length === 0) {
        accounts = await listAccounts()
        setMerchantAccounts(accounts)
      }
      const txHash = parseReturnReference(reference)
      const deposit = await waitForDeposit(txHash, undefined, 20_000)
      const ownsRecipient = accounts.some((account) => normaliseAddress(account) === normaliseAddress(deposit.recipient))
      if (!ownsRecipient) {
        throw new Error('This deposit was paid to a different merchant wallet. Authorise the wallet that originally received it.')
      }
      const existing = await findExistingRefund(deposit)
      setReturnReview({
        deposit,
        alreadyRefunded: Boolean(existing),
        refundTxHash: existing?.transactionHash?.toLowerCase(),
      })
      if (existing) setNotice('This deposit has already been refunded.')
    } catch (caught) {
      setError(walletMessage(caught, 'Return check'))
    } finally {
      setBusy('idle')
    }
  }

  async function refundDeposit() {
    const deposit = returnReview?.deposit
    if (!deposit || returnReview?.alreadyRefunded || busy !== 'idle') return
    clearMessages()
    if (!acquireRefundLock(deposit.txHash)) {
      setError('A refund is already in progress on this device. Check its status before trying again.')
      return
    }
    setBusy('refund-wallet')
    try {
      const latestExisting = await findExistingRefund(deposit)
      if (latestExisting) {
        setReturnReview({ deposit, alreadyRefunded: true, refundTxHash: latestExisting.transactionHash.toLowerCase() })
        setNotice('A matching refund already exists. No second payment was requested.')
        return
      }
      const requiredWallet = normaliseAddress(deposit.recipient)
      if (!merchantAccounts.some((address) => normaliseAddress(address) === requiredWallet)) {
        throw new Error('Authorise the same merchant wallet that received this deposit before refunding it.')
      }
      const refundTxHash = await sendRefund(deposit)
      setBusy('refund-chain')
      const refund = await waitForRefund(refundTxHash, deposit)
      setReturnReview({ deposit, alreadyRefunded: true, refundTxHash: refund.transactionHash.toLowerCase() })
      setNotice('Refund confirmed. The deposit has completed its turn.')
    } catch (caught) {
      setError(walletMessage(caught, 'Refund'))
    } finally {
      releaseRefundLock(deposit.txHash)
      setBusy('idle')
    }
  }

  const scanResult = useCallback((value: string) => {
    const activeScanner = scanner
    setScanner(null)
    if (activeScanner === 'counter') {
      try {
        setCounter(parseCounterLink(value))
        setSelectedReceipt(null)
        clearMessages()
      } catch (caught) {
        setError(messageFrom(caught))
      }
    } else if (activeScanner === 'return') {
      void reviewReturn(value)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanner, merchantAccounts])

  return (
    <div className="app-shell">
      <div className="ambient ambient--one" aria-hidden="true" />
      <div className="ambient ambient--two" aria-hidden="true" />

      <header className="topbar">
        <button className="brand" type="button" onClick={() => { setMode('customer'); setCounter(null); setSelectedReceipt(null); clearMessages() }} aria-label="Turn home">
          <span className="brand-mark">↻</span>
          <span>turn</span>
        </button>
        <div className={`network-pill network-pill--${providerState}`}>
          <span className="status-dot" />
          {providerState === 'ready' ? 'Nimiq Pay' : providerState === 'checking' ? 'checking' : 'preview'}
        </div>
      </header>

      <main>
        {error ? <Alert tone="error" text={error} onClose={() => setError('')} /> : null}
        {notice ? <Alert tone="success" text={notice} onClose={() => setNotice('')} /> : null}

        {mode === 'customer' ? (
          selectedReceipt ? (
            <ReceiptView receipt={selectedReceipt} busy={busy} onBack={() => setSelectedReceipt(null)} onRefresh={() => void refreshReceipt(selectedReceipt)} />
          ) : counter ? (
            <CounterCheckout counter={counter} busy={busy} providerState={providerState} onBack={() => setCounter(null)} onPay={() => void payDeposit()} />
          ) : (
            <CustomerHome receipts={receipts} providerState={providerState} busy={busy} onScan={() => setScanner('counter')} onOpenReceipt={setSelectedReceipt} onRecover={(value) => void recoverReceipt(value)} />
          )
        ) : (
          <MerchantView
            counter={merchantCounter}
            merchantAccounts={merchantAccounts}
            merchantConnected={merchantConnected}
            busy={busy}
            returnReview={returnReview}
            showSetup={showSetup}
            merchantName={merchantName}
            itemName={itemName}
            depositNim={depositNim}
            selectedAccount={selectedAccount}
            onMerchantName={setMerchantName}
            onItemName={setItemName}
            onDepositNim={setDepositNim}
            onSelectedAccount={setSelectedAccount}
            onSetup={() => setShowSetup(true)}
            onCancelSetup={() => setShowSetup(false)}
            onSaveSetup={saveMerchantSetup}
            onConnect={() => void openMerchantSession()}
            onScanReturn={() => setScanner('return')}
            onRefund={() => void refundDeposit()}
            onClearReturn={() => setReturnReview(null)}
          />
        )}
      </main>

      <nav className="mode-nav" aria-label="Turn mode">
        <button className={mode === 'customer' ? 'active' : ''} type="button" onClick={() => { setMode('customer'); setReturnReview(null); clearMessages() }}>
          <Undo2 size={19} /><span>return</span>
        </button>
        <button className={mode === 'merchant' ? 'active' : ''} type="button" onClick={() => { setMode('merchant'); setCounter(null); setSelectedReceipt(null); clearMessages() }}>
          <Store size={19} /><span>counter</span>
        </button>
      </nav>

      <ScannerModal
        open={Boolean(scanner)}
        title={scanner === 'counter' ? 'scan counter' : 'scan return receipt'}
        helper={scanner === 'counter' ? 'Point at a turn counter QR.' : 'Point at the customer’s return receipt.'}
        placeholder={scanner === 'counter' ? 'Paste turn counter link' : 'Paste receipt link or transaction hash'}
        onClose={() => setScanner(null)}
        onResult={scanResult}
      />
    </div>
  )
}

function CustomerHome({
  receipts,
  providerState,
  busy,
  onScan,
  onOpenReceipt,
  onRecover,
}: {
  receipts: TurnReceipt[]
  providerState: ProviderState
  busy: BusyState
  onScan: () => void
  onOpenReceipt: (receipt: TurnReceipt) => void
  onRecover: (value: string) => void
}) {
  const [recovering, setRecovering] = useState(false)
  const [reference, setReference] = useState('')

  return (
    <div className="stack page-enter">
      <section className="hero utility-card">
        <div className="hero-loop" aria-hidden="true"><span>↻</span></div>
        <span className="eyebrow">refundable deposits, without cash</span>
        <h1>pay it. bring it back. <em>get it back.</em></h1>
        <p>Scan a turn counter, pay the reusable-item deposit in NIM, then show your receipt when you return it.</p>
        <button className="button button--gold button--large" type="button" onClick={onScan} disabled={busy !== 'idle'}>
          <ScanLine size={20} /> scan a counter <ArrowRight size={18} />
        </button>
        <div className="trust-line"><ShieldCheck size={16} /><span>payments stay between you and the merchant</span></div>
      </section>

      {providerState === 'outside' ? <OutsideNimiqPay /> : null}

      <section className="section-block">
        <div className="section-heading">
          <div><span className="eyebrow"><History size={14} /> wallet receipts</span><h2>my returns</h2></div>
          {receipts.length ? <span className="count-pill">{receipts.length}</span> : null}
        </div>
        {receipts.length ? (
          <div className="receipt-list">
            {receipts.map((receipt) => (
              <button className="receipt-row" key={receipt.txHash} type="button" onClick={() => onOpenReceipt(receipt)}>
                <span className={`receipt-icon receipt-icon--${receipt.status}`}>{receipt.status === 'refunded' ? <Check size={18} /> : <RotateCcw size={18} />}</span>
                <span className="receipt-copy"><strong>{receipt.itemName}</strong><small>{receipt.merchantName} · {lunaToNim(receipt.depositLuna)} NIM</small></span>
                <StatusPill status={receipt.status} />
                <ChevronRight size={18} className="chevron" />
              </button>
            ))}
          </div>
        ) : (
          <div className="empty-state"><PackageCheck size={28} /><strong>No return receipts yet.</strong><span>Your first deposit receipt will stay here on this device.</span></div>
        )}
        <button className="text-button" type="button" onClick={() => setRecovering((value) => !value)}>recover a receipt by transaction hash</button>
        {recovering ? (
          <form className="recover-form" onSubmit={(event) => { event.preventDefault(); if (reference.trim()) onRecover(reference.trim()) }}>
            <input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Paste return link or 64-character transaction hash" autoCapitalize="off" />
            <button className="button button--quiet" type="submit" disabled={!reference.trim() || busy !== 'idle'}>recover</button>
          </form>
        ) : null}
      </section>
    </div>
  )
}

function CounterCheckout({ counter, busy, providerState, onBack, onPay }: {
  counter: CounterConfig
  busy: BusyState
  providerState: ProviderState
  onBack: () => void
  onPay: () => void
}) {
  const amount = lunaToNim(counter.depositLuna)
  const working = busy === 'wallet' || busy === 'chain'
  return (
    <div className="stack page-enter narrow">
      <button className="back-link" type="button" onClick={onBack}><ArrowLeft size={17} /> back</button>
      <section className="checkout-card utility-card">
        <div className="merchant-badge"><Store size={18} /><span>{counter.merchantName}</span></div>
        <div className="checkout-item">
          <span className="item-symbol">↻</span>
          <div><small>returnable item</small><h1>{counter.itemName}</h1></div>
        </div>
        <div className="amount-panel">
          <span>refundable deposit</span>
          <strong>{amount} <small>NIM</small></strong>
          <p>You pay the merchant now. Return the item and they send this exact amount back to the same wallet.</p>
        </div>
        <div className="address-row"><span>to</span><code>{shortAddress(counter.merchantAddress)}</code></div>
        <button className="button button--gold button--large" type="button" onClick={onPay} disabled={working || providerState !== 'ready'}>
          {busy === 'wallet' ? <><LoaderCircle className="spin" size={19} /> approve in Nimiq Pay</> : busy === 'chain' ? <><LoaderCircle className="spin" size={19} /> confirming on-chain</> : <><WalletCards size={19} /> pay {amount} NIM deposit</>}
        </button>
        {providerState !== 'ready' ? <p className="field-note">Open this counter inside Nimiq Pay to pay.</p> : null}
      </section>
      <div className="trust-grid">
        <div><ShieldCheck /><strong>direct payment</strong><span>turn never holds your NIM</span></div>
        <div><RotateCcw /><strong>same amount back</strong><span>refund is checked against this deposit</span></div>
      </div>
    </div>
  )
}

function ReceiptView({ receipt, busy, onBack, onRefresh }: {
  receipt: TurnReceipt
  busy: BusyState
  onBack: () => void
  onRefresh: () => void
}) {
  const returnLink = buildReturnLink(APP_BASE, receipt.txHash)
  const active = receipt.status === 'active'
  const submitted = receipt.status === 'submitted'
  return (
    <div className="stack page-enter narrow">
      <button className="back-link" type="button" onClick={onBack}><ArrowLeft size={17} /> my returns</button>
      <section className={`receipt-card utility-card receipt-card--${receipt.status}`}>
        <div className="receipt-state-icon">{receipt.status === 'refunded' ? <CheckCircle2 /> : submitted ? <Clock3 /> : <RotateCcw />}</div>
        <span className="eyebrow">{receipt.status === 'refunded' ? 'completed' : submitted ? 'payment submitted' : 'ready to return'}</span>
        <h1>{receipt.itemName}</h1>
        <p className="receipt-merchant">{receipt.merchantName}</p>
        <div className="receipt-amount"><span>{receipt.status === 'refunded' ? 'refunded' : 'deposit'}</span><strong>{lunaToNim(receipt.depositLuna)} NIM</strong></div>
        {active ? <QrPanel value={returnLink} label="show this when you return it" helper="The merchant scans this receipt, verifies your deposit on Nimiq, then refunds it." shareTitle="turn return receipt" /> : null}
        {submitted ? <div className="pending-panel"><LoaderCircle className={busy === 'chain' ? 'spin' : ''} /><strong>Waiting for on-chain confirmation</strong><span>Your transaction hash is saved on this device.</span></div> : null}
        {receipt.status === 'refunded' ? <div className="complete-panel"><CheckCircle2 /><div><strong>deposit returned</strong><span>The matching refund was found on Nimiq.</span></div></div> : null}
        <button className="button button--quiet" type="button" onClick={onRefresh} disabled={busy !== 'idle'}><RefreshCw size={17} className={busy === 'chain' ? 'spin' : ''} /> {receipt.status === 'refunded' ? 'verify again' : 'check status'}</button>
        <TxFootnote hash={receipt.txHash} label="deposit transaction" />
        {receipt.refundTxHash ? <TxFootnote hash={receipt.refundTxHash} label="refund transaction" /> : null}
      </section>
    </div>
  )
}

function MerchantView(props: {
  counter: CounterConfig | null
  merchantAccounts: string[]
  merchantConnected: boolean
  busy: BusyState
  returnReview: ReturnReview | null
  showSetup: boolean
  merchantName: string
  itemName: string
  depositNim: string
  selectedAccount: string
  onMerchantName: (value: string) => void
  onItemName: (value: string) => void
  onDepositNim: (value: string) => void
  onSelectedAccount: (value: string) => void
  onSetup: () => void
  onCancelSetup: () => void
  onSaveSetup: (event: React.FormEvent) => void
  onConnect: () => void
  onScanReturn: () => void
  onRefund: () => void
  onClearReturn: () => void
}) {
  const {
    counter, merchantAccounts, merchantConnected, busy, returnReview, showSetup,
    merchantName, itemName, depositNim, selectedAccount,
    onMerchantName, onItemName, onDepositNim, onSelectedAccount,
    onSetup, onCancelSetup, onSaveSetup, onConnect, onScanReturn, onRefund, onClearReturn,
  } = props

  if (returnReview) {
    return <ReturnReviewView review={returnReview} busy={busy} onBack={onClearReturn} onRefund={onRefund} />
  }

  if (showSetup || !counter) {
    return (
      <div className="stack page-enter narrow">
        {counter ? <button className="back-link" type="button" onClick={onCancelSetup}><ArrowLeft size={17} /> counter</button> : null}
        <section className="utility-card setup-card">
          <span className="eyebrow"><Store size={14} /> one-minute setup</span>
          <h1>make a return counter.</h1>
          <p>Choose the wallet that receives deposits, name the item, and set one refundable amount.</p>
          {merchantAccounts.length === 0 ? (
            <button className="button button--gold" type="button" onClick={onConnect} disabled={busy !== 'idle'}>{busy === 'wallet' ? <LoaderCircle className="spin" /> : <WalletCards />} authorise merchant wallet</button>
          ) : (
            <form className="setup-form" onSubmit={onSaveSetup}>
              <label><span>merchant name</span><input value={merchantName} onChange={(event) => onMerchantName(event.target.value)} placeholder="Loop Coffee" maxLength={40} /></label>
              <label><span>returnable item</span><input value={itemName} onChange={(event) => onItemName(event.target.value)} placeholder="Reusable cup" maxLength={40} /></label>
              <label><span>deposit</span><div className="amount-input"><input inputMode="decimal" value={depositNim} onChange={(event) => onDepositNim(event.target.value)} /><b>NIM</b></div></label>
              <label><span>receiving wallet</span><select value={selectedAccount} onChange={(event) => onSelectedAccount(event.target.value)}>{merchantAccounts.map((account) => <option key={account} value={account}>{shortAddress(account)}</option>)}</select></label>
              <button className="button button--gold button--large" type="submit">create counter <ArrowRight size={18} /></button>
            </form>
          )}
        </section>
      </div>
    )
  }

  const counterLink = buildCounterLink(APP_BASE, counter)
  return (
    <div className="stack page-enter merchant-layout">
      <section className="counter-card utility-card">
        <div className="counter-heading"><div><span className="eyebrow">live counter</span><h1>{counter.merchantName}</h1><p>{counter.itemName} · {lunaToNim(counter.depositLuna)} NIM refundable</p></div><span className="live-badge"><i /> ready</span></div>
        <QrPanel value={counterLink} label="customer counter" helper="Customers scan this before taking the item." shareTitle={`${counter.merchantName} turn counter`} shareText={`${counter.itemName} — ${lunaToNim(counter.depositLuna)} NIM refundable deposit`} compact />
        <div className="counter-wallet"><span>receiving wallet</span><code>{shortAddress(counter.merchantAddress)}</code></div>
      </section>

      <section className="return-action utility-card utility-card--gold-edge">
        <div className="return-action-icon"><RotateCcw /></div>
        <span className="eyebrow">item came back?</span>
        <h2>scan the customer’s receipt.</h2>
        <p>turn will verify the original deposit on Nimiq before any refund can be requested.</p>
        {!merchantConnected ? (
          <button className="button button--gold button--large" type="button" onClick={onConnect} disabled={busy !== 'idle'}>{busy === 'wallet' ? <LoaderCircle className="spin" /> : <WalletCards />} authorise refund wallet</button>
        ) : (
          <button className="button button--gold button--large" type="button" onClick={onScanReturn} disabled={busy !== 'idle'}><ScanLine /> scan return receipt</button>
        )}
        <button className="text-button" type="button" onClick={onSetup}>edit counter</button>
      </section>
    </div>
  )
}

function ReturnReviewView({ review, busy, onBack, onRefund }: { review: ReturnReview; busy: BusyState; onBack: () => void; onRefund: () => void }) {
  const { deposit, alreadyRefunded } = review
  return (
    <div className="stack page-enter narrow">
      <button className="back-link" type="button" onClick={onBack}><ArrowLeft size={17} /> return desk</button>
      <section className={`utility-card refund-card ${alreadyRefunded ? 'refund-card--done' : ''}`}>
        <div className="verification-seal">{alreadyRefunded ? <CheckCircle2 /> : <ShieldCheck />}</div>
        <span className="eyebrow">{alreadyRefunded ? 'already completed' : 'deposit verified on Nimiq'}</span>
        <h1>{alreadyRefunded ? 'refund already sent.' : 'confirm the item is back.'}</h1>
        <div className="verification-table">
          <div><span>original deposit</span><strong>{lunaToNim(deposit.valueLuna)} NIM</strong></div>
          <div><span>refund to</span><code>{shortAddress(deposit.sender)}</code></div>
          <div><span>received by</span><code>{shortAddress(deposit.recipient)}</code></div>
          <div><span>deposit tx</span><code>{shortHash(deposit.txHash)}</code></div>
        </div>
        {alreadyRefunded ? (
          <div className="complete-panel"><CheckCircle2 /><div><strong>no second refund requested</strong><span>A matching refund is already included on-chain.</span></div></div>
        ) : (
          <>
            <div className="physical-check"><PackageCheck /><div><strong>physical check</strong><span>Only continue after you have the returned item in hand.</span></div></div>
            <button className="button button--gold button--large" type="button" onClick={onRefund} disabled={busy !== 'idle'}>
              {busy === 'refund-wallet' ? <><LoaderCircle className="spin" /> approve refund</> : busy === 'refund-chain' ? <><LoaderCircle className="spin" /> confirming refund</> : <><CircleDollarSign /> refund {lunaToNim(deposit.valueLuna)} NIM</>}
            </button>
            <p className="field-note">Prefer the same Nimiq account that received the deposit ({shortAddress(deposit.recipient)}). The native approval screen shows the sending wallet.</p>
          </>
        )}
        {review.refundTxHash ? <TxFootnote hash={review.refundTxHash} label="refund transaction" /> : null}
      </section>
    </div>
  )
}

function OutsideNimiqPay() {
  const deepLink = `nimiqpay://miniapp?url=${encodeURIComponent(window.location.href)}`
  return (
    <section className="outside-card">
      <div><span className="eyebrow">preview mode</span><strong>Wallet actions live inside Nimiq Pay.</strong><p>You can browse turn here, but deposits and refunds need Nimiq Pay’s native approval screen.</p></div>
      <a className="button button--quiet button--small" href={deepLink}>open in Nimiq Pay <ExternalLink size={15} /></a>
    </section>
  )
}

function Alert({ tone, text, onClose }: { tone: 'error' | 'success'; text: string; onClose: () => void }) {
  return <div className={`alert alert--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{tone === 'error' ? <XCircle /> : <CheckCircle2 />}<span>{text}</span><button type="button" onClick={onClose} aria-label="Dismiss">×</button></div>
}

function StatusPill({ status }: { status: TurnReceipt['status'] }) {
  const label = status === 'active' ? 'returnable' : status === 'refunded' ? 'returned' : 'checking'
  return <span className={`status-pill status-pill--${status}`}>{label}</span>
}

function TxFootnote({ hash, label }: { hash: string; label: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    const ok = await copyText(hash)
    if (!ok) return
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }
  return <div className="tx-footnote"><span>{label}</span><button type="button" onClick={copy}><code>{shortHash(hash)}</code>{copied ? <Check size={13} /> : <Copy size={13} />}</button></div>
}

function shortAddress(address: string): string {
  const clean = normaliseAddress(address)
  return clean.length > 12 ? `${clean.slice(0, 7)}…${clean.slice(-5)}` : clean
}

function shortHash(hash: string): string {
  return hash.length > 18 ? `${hash.slice(0, 9)}…${hash.slice(-7)}` : hash
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Try again.'
}

function walletMessage(error: unknown, action: string): string {
  const message = messageFrom(error)
  const name = error && typeof error === 'object' && 'name' in error ? String((error as { name?: unknown }).name) : ''
  if (/PermissionDenied|denied|reject|cancel/i.test(`${name} ${message}`)) {
    return `${action} cancelled. Nothing new was marked complete.`
  }
  if (/InvalidTransaction/i.test(`${name} ${message}`)) return `${action} could not be created. Check the payment details and try again.`
  return message
}
