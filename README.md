# turn

**Pay the deposit. Bring the item back. Get the same NIM back.**

turn is a focused Nimiq Pay Mini App for refundable deposits on reusable items such as cups, containers, event gear, or other items a merchant expects back.

**Production:** https://turn-nimiq.vercel.app/

A customer scans a merchant counter, pays a NIM deposit, and receives a return receipt. When the item comes back, the merchant scans that receipt. turn independently verifies the original deposit on the Nimiq blockchain, derives the customer's refund address from that transaction, checks for an existing matching refund, and asks Nimiq Pay to return the exact deposit amount.

## Why the architecture is intentionally small

turn has **no backend, database, custodial wallet, smart contract, account system, or private key**.

The blockchain transaction is the receipt:

```text
customer ── deposit ──> merchant
   ^                      |
   |                      |
   └──── exact refund ────┘
```

Payment markers are compact text payloads:

```text
turn:d:<nonce>   # deposit
turn:r:<nonce>   # matching refund
```

The customer device keeps local receipt metadata for convenience, and the merchant device keeps its saved counter configurations locally. Neither is financial authority: financial truth is reconstructed from the Nimiq chain. Losing local storage does not invalidate a deposit transaction; a receipt can be recovered by deposit transaction hash.

## Core flow

### Customer

1. Open turn inside Nimiq Pay.
2. Scan a merchant counter QR or paste the counter link.
3. Review merchant, item, and exact refundable NIM amount.
4. Approve the native Nimiq Pay transaction.
5. turn verifies that the transaction is included and matches the expected recipient, value, network, and deposit marker.
6. Show the return receipt when the item is returned.

### Merchant

1. Authorise wallet address access in Nimiq Pay.
2. Create one or more counters. Each counter has its own merchant name, returnable item, NIM deposit and receiving wallet.
3. Open the required saved counter and let customers scan its QR.
4. Edit or delete local counter configurations without changing existing on-chain deposits.
5. When an item returns, scan the customer's return receipt.
6. turn verifies the deposit and checks for an already-included matching refund.
7. Physically confirm the item is back and approve the exact refund in Nimiq Pay.
8. turn verifies the customer received the exact amount tagged to that deposit before calling it complete.

An existing pre-multi-counter configuration is migrated automatically into the saved counter list on first load.

## Trust model

turn is **not escrow**.

The deposit goes directly to the merchant. The merchant controls those funds until they honour the return. turn does not claim to lock funds or cryptographically compel a refund.

What turn does enforce in software is that a valid refund review is derived from the original on-chain deposit: the customer address, amount, deposit nonce, and merchant recipient cannot be edited by a QR payload or form field.

The Mini App SDK does not expose a sender-selection argument for NIM payments. The merchant UI therefore tells the operator to prefer the same wallet that received the deposit. Completion is based on the customer receiving the exact original amount with the exact deposit nonce, so turn does not accidentally request a second refund if Nimiq Pay sends from another authorised merchant account.

## Stack

- React 19 + TypeScript + Vite
- `@nimiq/mini-app-sdk` for Nimiq Pay wallet operations
- `@nimiq/core` Web Client for independent browser-side chain verification
- `qr-scanner` for camera handoff
- `qrcode` for counter and receipt QR generation
- localStorage only for non-authoritative convenience state and saved counter configurations
- Vercel for the production HTTPS deployment

## Development

Requirements: Node.js 22+.

```bash
npm install
npm test
npm run typecheck
npm run build
npm run dev
```

The Nimiq light client is wired through the official `@nimiq/core/vite` plugin.

### Network

Production defaults to `MainAlbatross`.

```bash
VITE_NIMIQ_NETWORK=MainAlbatross npm run dev
```

For protocol work you can set `TestAlbatross`, but wallet-side network compatibility must be confirmed in the current Nimiq Pay build before attempting a payment.

### Secure-context note

Camera access, Clipboard APIs, and some WebView browser APIs require HTTPS. The app includes paste/copy fallbacks, but real-device acceptance testing must use an HTTPS build inside Nimiq Pay.

## Verification rules

A deposit becomes active only if the independently fetched transaction is:

- included and valid;
- on the configured Nimiq network;
- addressed to the counter merchant;
- for the exact advertised Luna amount;
- carrying the expected `turn:d:<nonce>` marker.

A refund becomes complete only if it is:

- included and valid;
- sent to the original deposit sender;
- for the exact original Luna amount;
- carrying `turn:r:<same nonce>`.

Before requesting a refund, turn queries verified recent transactions involving the customer and refuses to request a second payment if a matching refund already exists.

## Important concurrency boundary

There is no protocol-level escrow or atomic refund lock. turn prevents accidental duplicate refunds on one device and checks the blockchain immediately before refunding. Two merchant devices could still race before either refund is included. The UI and documentation intentionally do not overclaim this protection.

## Quality gates

GitHub Actions runs the automated test, typecheck, and production build gates on every push. Vercel deploys the `main` branch to the production URL above.

The final release gate is real-device testing inside the current Nimiq Pay app. See [`docs/TEST-MATRIX.md`](docs/TEST-MATRIX.md) for the exact acceptance flow and [`docs/SUBMISSION.md`](docs/SUBMISSION.md) for the competition-ready description, demo script, and promotion copy.

Additional documentation:

- [`docs/RESEARCH.md`](docs/RESEARCH.md) — API and architecture closure
- [`docs/PRD.md`](docs/PRD.md) — product specification
- [`docs/TEST-MATRIX.md`](docs/TEST-MATRIX.md) — acceptance and failure cases
- [`docs/SUBMISSION.md`](docs/SUBMISSION.md) — submission and launch package
- [`AGENTS.md`](AGENTS.md) — guardrails for later implementation work

## Competition scope

The competition build deliberately excludes smart contracts, HTLCs, escrow, USDT, EVM integrations, NFTs, AI, staff accounts, inventory, merchant analytics, messaging, loyalty systems, and customer profiles.

If it does not directly improve **deposit → receipt → return → refund**, it does not belong in this build.

## License

MIT.