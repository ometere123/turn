# turn — tiny PRD

## Product sentence

turn lets a merchant take a refundable NIM deposit for a reusable item and return the exact amount to a customer-authorised Nimiq address that is bound into the original deposit transaction.

## Main loop

```text
scan counter → authorise refund address → pay deposit → keep receipt → return item → merchant verifies → refund
```

## Customer requirements

The customer can:

1. scan or paste a counter;
2. see merchant, item, and exact NIM amount before any wallet request;
3. authorise the Nimiq receive address that must receive the refund;
4. approve a NIM deposit in the native Nimiq Pay dialog;
5. see a non-final `submitted` state until turn independently sees the confirmed transaction;
6. retain a local return receipt after refresh when browser storage is available;
7. recover a receipt from its deposit transaction hash;
8. show a QR receipt to the merchant;
9. check whether a matching refund is confirmed.

No customer registration is required.

## Merchant requirements

The merchant can:

1. approve `listAccounts()` access;
2. choose a receiving wallet;
3. create multiple saved counters on one device;
4. configure merchant name, item name, NIM deposit, and receiving wallet independently for each counter;
5. switch between saved counters and display/share the selected counter QR;
6. edit a saved counter without overwriting the other counters;
7. delete a local counter configuration without altering existing customer deposits or receipts;
8. have the old single-counter local configuration migrated automatically into the counter list;
9. scan or paste a customer return receipt;
10. see an independently verified deposit before refunding;
11. see the immutable customer-authorised refund destination and amount read from the original deposit;
12. confirm the physical item is back;
13. request the exact NIM refund through Nimiq Pay;
14. see completion only after turn verifies the matching refund transaction.

Counters are local convenience configuration only. They are not accounts, inventory, or financial state.

## Product states

Customer receipt:

- `submitted`
- `active`
- `refunded`

Merchant counter:

- saved
- selected/open
- creating
- editing

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
- exact amount and customer-authorised destination shown before refund;
- saved counters remain easy to switch, edit, create, and delete;
- deleting a counter must state that existing on-chain deposits are unchanged;
- local storage is convenience state and a storage failure must never redefine an on-chain payment outcome;
- slow confirmation must preserve the submitted receipt when possible and explicitly warn the customer not to pay again;
- crypto terminology limited to NIM, wallet, and transaction where necessary;
- no claims of escrow or guaranteed merchant behaviour.

## Merchant activity boundary

Merchant activity is reconstructed from Nimiq by receiving wallet and deposit amount. If two counters use the same receiving wallet and identical deposit amount, their activity is grouped because the human-readable counter labels are not part of the authoritative on-chain deposit marker. The UI must label this as wallet/amount activity rather than counter-specific analytics.

## Competition scope freeze

Included:

- NIM deposits
- customer-authorised refund-address binding
- chain verification
- multiple local merchant counters
- legacy single-counter migration
- counter QR and shareable links
- receipt QR
- refund verification
- local receipt persistence
- receipt recovery
- camera + paste fallback
- merchant activity derived from Nimiq
- duplicate counter and quick presets
- receipt sharing
- mobile/error/pending states

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
- server-backed analytics
- messaging
- subscriptions
- fiat pricing
- push notifications

Any feature outside the main loop requires an explicit product decision before implementation.
