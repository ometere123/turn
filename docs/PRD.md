# turn — tiny PRD

## Product sentence

turn lets a merchant take a refundable NIM deposit for a reusable item and return the exact amount to the original paying wallet when the item comes back.

## Main loop

```text
scan counter → pay deposit → keep receipt → return item → merchant verifies → refund
```

## Customer requirements

The customer can:

1. scan or paste a counter;
2. see merchant, item, and exact NIM amount before any wallet request;
3. approve a NIM deposit in the native Nimiq Pay dialog;
4. see a non-final “checking” state until turn independently sees the included transaction;
5. retain a local return receipt after refresh;
6. recover a receipt from its deposit transaction hash;
7. show a QR receipt to the merchant;
8. check whether a matching refund is included.

No customer registration is required.

## Merchant requirements

The merchant can:

1. approve `listAccounts()` access;
2. choose a receiving wallet;
3. configure merchant name, item name, and NIM deposit;
4. display/share a counter QR;
5. scan or paste a customer return receipt;
6. see an independently verified deposit before refunding;
7. see the immutable refund destination and amount;
8. confirm the physical item is back;
9. request the exact NIM refund through Nimiq Pay;
10. see completion only after turn verifies the refund transaction.

## Product states

Customer receipt:

- `submitted`
- `active`
- `refunded`

Merchant return review:

- verifying
- refundable
- already refunded
- refund awaiting wallet approval
- refund confirming
- complete

## UX rules

- mobile portrait first;
- one primary action per state;
- no wallet request on page load;
- cancellation is normal, not a crash;
- no infinite spinner without text;
- QR always has paste fallback;
- exact amount and destination shown before refund;
- crypto terminology limited to NIM, wallet, and transaction where necessary;
- no claims of escrow or guaranteed merchant behaviour.

## Competition scope freeze

Included:

- NIM deposits
- chain verification
- counter QR
- receipt QR
- refund verification
- local receipt persistence
- receipt recovery
- camera + paste fallback
- mobile/offline-ish error states

Excluded:

- smart contracts
- escrow
- HTLC
- USDT / EVM
- inventory
- teams/staff
- profiles
- email/phone
- loyalty
- AI
- geolocation
- analytics dashboard
- messaging
- subscriptions
- fiat pricing
- push notifications

Any feature outside the main loop requires an explicit product decision before implementation.
