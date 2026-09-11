# turn implementation guardrails

Read `README.md` and everything in `docs/` before changing code.

## Product freeze

The product is only:

```text
deposit → verified receipt → physical return → verified refund
```

Do not add a backend, database, auth service, smart contract, escrow, HTLC, token, USDT/EVM layer, AI, inventory, staff accounts, merchant analytics, or generic dashboard unless the human owner explicitly changes the product scope.

## Source of truth

Financial truth comes from Nimiq transactions, never localStorage or QR fields.

- return recipient = verified deposit sender
- refund value = verified deposit value
- merchant = verified deposit recipient
- nonce = verified `turn:d:<nonce>` data

Local storage is only convenience state.

## Wallet rule

`sendBasicTransactionWithData` does not expose a sender parameter. Never pretend the frontend can force the refund account. The merchant should use the address that received the deposit. Because the SDK does not expose a sender argument, turn treats an included exact-value, exact-nonce payment to the original customer as the refund and never silently requests a second payment after one is found.

## UX rule

Keep the current restrained payment-utility design. Do not replace it with a generic AI landing page, giant gradient hero, bento-grid marketing site, excessive glass cards, 3D objects, or copy-heavy onboarding.

Mobile inside Nimiq Pay is the primary surface.

## Verification before pushing

Run:

```bash
npm test
npm run typecheck
npm run build
```

If an API assumption differs from the current installed Nimiq package, verify against current Nimiq developer documentation/source before changing architecture.
