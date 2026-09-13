# turn — research and architecture closure

Research closure date: **11 September 2026**.

This document records the current APIs and product decisions the implementation is allowed to depend on. It exists to stop future work from inventing infrastructure that the product does not need.

## 1. Nimiq Pay Mini App runtime

Official developer documentation describes Mini Apps as web applications loaded in a Nimiq Pay WebView. The host injects wallet providers. Sensitive actions are mediated by Nimiq Pay and require native user confirmation; private keys never enter the Mini App.

Primary source:
- https://nimiq.dev/mini-apps/

Relevant native Nimiq provider methods:

- `init()` from `@nimiq/mini-app-sdk`
- `listAccounts(): Promise<string[]>`
- `isConsensusEstablished(): Promise<boolean>`
- `getBlockNumber(): Promise<number>`
- `sendBasicTransaction(...) -> Promise<string>`
- `sendBasicTransactionWithData(...) -> Promise<string>`

Current payment API parameters are:

```ts
{
  recipient: string
  value: number       // Luna
  data: string        // with-data variant
  fee?: number
  validityStartHeight?: number
}
```

The returned string is the transaction hash. `listAccounts` and payment requests require native approval. The payment API does **not** accept a sender address, so turn cannot programmatically force which of a user's accounts funds a refund.

Primary source:
- https://nimiq.dev/mini-apps/api-reference/nimiq-provider

## 2. Units and transaction data

NIM amounts passed to the provider are integer Luna:

```text
1 NIM = 100,000 Luna
```

A Nimiq transaction to a basic address can carry up to 64 bytes of unstructured data. turn uses compact ASCII markers within that ceiling:

```text
turn:d:<nonce>:<refund-address>
turn:r:<nonce>
```

The deposit marker binds a customer-authorised refund address to the deposit itself. Older legacy deposits without that address can still be identified, but the current refund flow refuses to refund them because there is no immutable customer-authorised destination in the transaction.

Primary source:
- https://nimiq.dev/web-client/guides/send-transactions

## 3. Browser-side transaction verification

`@nimiq/core` provides a WebAssembly light client that connects from the browser without turn operating a backend. The official Vite integration exposes `@nimiq/core/vite`.

Production configuration:

```ts
const config = new Nimiq.ClientConfiguration()
config.network('MainAlbatross')
const client = await Nimiq.Client.create(config.build())
```

Relevant methods include:

- `getTransaction(hash)`
- `getTransactionsByAddress(address, ...)`
- `isConsensusEstablished()`

turn waits for client consensus before treating chain lookups as authoritative.

Primary sources:
- https://nimiq.dev/web-client/
- https://nimiq.dev/web-client/integrations/vite
- https://nimiq.dev/web-client/reference/classes/client
- https://nimiq.dev/web-client/guides/query-the-blockchain

## 4. Plain transaction shape

Current `PlainTransaction` exposes human-readable fields including sender, recipient, value, network, data, transaction hash, and validity state. Data can fall back to a `{ raw: string }` representation; turn decodes raw hex before interpreting its marker.

The Nimiq web-client source serialises network names to lower-case strings (for example the configured `MainAlbatross` representation may appear hyphenated/lower-case). turn normalises network labels before comparison rather than comparing raw display formatting.

Primary sources:
- https://nimiq.dev/web-client/reference/interfaces/plaintransaction
- https://github.com/nimiq/core-rs-albatross/blob/albatross/web-client/src/common/transaction.rs

## 5. Receipt architecture

### Decision

The deposit transaction **is** the authoritative receipt.

A separate backend receipt database would duplicate data already signed, broadcast, and verifiable on Nimiq while adding deployment secrets, availability risk, account/session complexity, and reconciliation failure modes.

### Counter handoff

A merchant counter QR contains only public setup data:

- merchant Nimiq address
- merchant display name
- returnable item label
- exact deposit amount in Luna
- format version

The customer UI validates the address before opening the native payment request.

### Deposit binding

Before paying, the customer authorises a Nimiq address returned by `listAccounts()`. turn writes that address into the deposit data beside a random nonce.

The deposit therefore binds:

- merchant recipient;
- exact amount;
- deposit nonce;
- customer-authorised refund address.

### Return handoff

A customer return QR contains only a same-origin URL with the deposit transaction hash.

It does **not** carry a refund recipient or amount. Those values are derived from the verified deposit transaction.

## 6. Refund architecture

For a verified current-format deposit:

```text
refund recipient = deposit.refundAddress
refund amount    = deposit.value
required merchant authorisation = deposit.recipient
refund nonce     = parsed turn:d:<nonce>:<refund-address>
```

The requested refund carries:

```text
turn:r:<same nonce>
```

Before opening the Nimiq Pay refund confirmation, turn searches verified transactions involving the bound refund address for a matching exact-amount, exact-nonce refund before asking for another payment.

The Mini App SDK does not expose a sender-selection argument. turn therefore verifies that the wallet which received the deposit is present in the authorised account list and tells the operator to check the native Nimiq Pay approval screen. A matching refund remains defined by destination, amount and nonce rather than by assuming the provider exposed a selectable sender.

After Nimiq Pay returns a refund hash, turn independently verifies the confirmed transaction before showing completion.

## 7. Explicit trust boundary

The deposit is merchant-held, not escrowed.

No smart contract, HTLC, or turn-controlled wallet sits between parties. A dishonest or insolvent merchant can refuse to refund. The product must never use wording such as “funds locked”, “guaranteed refund”, or “trustless escrow”.

## 8. Duplicate-refund boundary

Without a shared server or on-chain escrow state, turn cannot provide an atomic lock across multiple merchant devices.

Implemented safeguards:

- check the chain for an existing matching refund before opening the wallet;
- best-effort local in-progress lock on the current merchant device;
- disabled duplicate CTA while a request is in flight;
- ambiguous wallet outcomes are reconciled against chain activity before inviting another payment;
- verify the exact refund after broadcast;
- show already-refunded receipts as terminal.

Known residual race:

Two merchant devices can theoretically inspect the same unrefunded deposit at almost the same time and each ask Nimiq Pay for a refund before either transaction becomes visible. This is documented rather than hidden.

## 9. Local persistence boundary

localStorage is convenience state only. It stores receipt metadata, counters and same-device duplicate guards, but it is never the financial authority.

Storage writes are best-effort. A storage failure after Nimiq Pay has already broadcast a transaction must not convert that real on-chain outcome into an application-level payment failure. Receipt recovery by deposit transaction hash remains the fallback when local metadata is unavailable.

## 10. Merchant activity boundary

Merchant activity is reconstructed from the receiving wallet's Nimiq transactions. The current on-chain deposit marker does not include a counter ID or human-readable item label.

Therefore activity can be filtered reliably by receiving wallet and amount, but two counters sharing the same wallet and amount are indistinguishable on-chain. The UI labels this as grouped wallet/amount activity instead of claiming counter-specific analytics.

## 11. Camera and secure context

Camera scanning is enhancement, not a critical dependency.

Production must use HTTPS. If camera permission is denied or unavailable, both customer and merchant flows accept the same QR payload as pasted text. Clipboard writes also have a fallback for constrained WebViews.

## 12. Deep links

Current Nimiq documentation exposes:

```text
nimiqpay://miniapp?url=your-app.com
```

turn uses that scheme only as an outside-Nimiq-Pay convenience link. Core payment and return state never depends on a deep link.

## 13. Excluded architecture

Do not add these to solve a problem that the current chain-verified flow already solves:

- backend API
- PostgreSQL / Supabase / Firebase
- auth provider
- server sessions
- server wallet
- cron jobs
- smart contract
- HTLC
- custom token
- EVM escrow
- server-backed analytics layer

A later version may revisit them only against a new requirement.
