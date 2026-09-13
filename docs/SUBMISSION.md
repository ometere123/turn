# turn — competition submission package

Production: https://turn-nimiq.vercel.app/

Repository: https://github.com/ometere123/turn

License: MIT

## Submission title

turn

## Short description

Refundable NIM deposits for reusable items. Pay the deposit, bring the item back, and get the same NIM back.

## Competition description

turn is a Nimiq Pay Mini App for cafés, events, venues, and other merchants that lend reusable items and want a simple refundable deposit without cash, accounts, or a custodial service.

A merchant creates reusable-item counters with a NIM deposit and receiving wallet. Customers scan or open a shared counter, authorise the Nimiq address that should receive their refund, approve the exact deposit in Nimiq Pay, and the original blockchain transaction becomes the receipt. turn saves the receipt immediately when browser storage is available while Nimiq confirms it, so a slow confirmation never requires a second payment.

When the item comes back, the merchant scans the receipt. turn verifies the original deposit on Nimiq, reads the customer-authorised refund address and exact amount from that deposit, checks for an existing matching refund, and then asks Nimiq Pay to send the refund. The cycle is complete only after the matching refund is confirmed on-chain.

Merchants can run multiple counters, duplicate counters, share counter links, use quick item presets, inspect chain-derived wallet/amount activity and refund history, and see simple deposit/refunded/outstanding counts. Customers keep a local receipt history and can share compact transaction proof.

turn never holds funds, stores private keys, or pretends to be escrow. Payments stay directly between customer and merchant.

## Tested release evidence

A complete Testnet release gate passed on real devices: 0.2 NIM deposit → saved receipt → on-chain deposit verification → merchant receipt scan → bound-address refund → on-chain refund verification → duplicate-refund protection.

Verified refund transaction:
`e808f3dd55aa4de2d564f531449e6b6c815a0376c6c23db39415afaa1f364dd3`

Testnet confirmation was observed to take several minutes. The product therefore treats a submitted transaction as a saved pending receipt when storage is available and explicitly tells the user not to submit a second payment while confirmation is pending.

## Final feature set

- Multiple reusable-item counters per merchant device.
- Chain-verified deposit and refund lifecycle.
- Customer-authorised refund address bound into the original deposit transaction.
- Merchant activity and refund history derived from Nimiq.
- Customer receipt lifecycle and shareable proof.
- Shareable digital counter links and QR counters.
- Counter duplication.
- Quick presets for common reusable items.
- Local enable/disable sharing preference for counters. Existing shared links remain valid because turn intentionally has no backend revocation service.
- Simple wallet/amount deposit, refunded, and outstanding counts. Counters using the same receiving wallet and amount are grouped because counter labels are not authoritative on-chain data.
- Duplicate-payment and duplicate-refund protections for ambiguous wallet outcomes.
- Mainnet/Testnet context separation for local receipts.
- turn mark used as the product logo/favicon.

## Demo script

Target length: 55–75 seconds.

1. Open turn inside Nimiq Pay and show Return and Counter.
2. Show multiple saved counters and the turn tools panel briefly.
3. Create or open a reusable cup counter with a tiny NIM deposit.
4. Share/show the counter QR.
5. On the customer wallet, scan it and show merchant, item, exact NIM amount, and authorised refund address.
6. Approve the deposit once in Nimiq Pay.
7. Show the saved confirming receipt, then the Ready to return receipt after confirmation.
8. Back on the merchant wallet, scan the receipt and show the verified original deposit and bound refund destination.
9. Approve the exact refund in Nimiq Pay.
10. Finish on Refund already sent / completed and show the matching refund in Nimiq Pay.

Narration: “turn replaces awkward cash deposits for reusable items with a tiny NIM loop. The customer pays the merchant directly, the deposit transaction becomes the receipt, and when the item comes back turn verifies that transaction and guides the merchant through the exact refund to the customer-authorised address. No accounts, no backend custody, no private keys, and no fake escrow claims.”

## Screenshot set

Use clean screenshots without debug overlays or unrelated browser chrome where possible:

1. Customer home — Pay it. Bring it back. Get it back.
2. Merchant live counter with QR.
3. Customer checkout showing item, exact NIM deposit and refund address.
4. Ready to return receipt with QR.
5. Merchant Deposit verified on Nimiq return screen.
6. Refund already sent / completed state.
7. Optional: turn tools wallet activity/stats panel.

Do not use the earlier failed/mismatched-network test screenshots as submission assets.

## Required visual assets

- `icon.png`: square turn mark on the Nimiq-yellow tile.
- `thumbnail.png`: turn mark + “take it. use it. turn it back.” + a clean representation of the deposit → return → refund loop.
- Favicon/product mark: `public/turn-mark.svg`.

## Skool launch post

Built **turn** for Cycle II.

A café, event, or venue can take a refundable NIM deposit for a reusable item and return the same amount when the item comes back. The original Nimiq transaction becomes the receipt, so turn can verify the merchant, amount, customer-authorised refund address and final refund without holding funds itself.

The full deposit → receipt → return → refund loop is working on real devices. I’m looking for Nimiq Pay users to try it and tell me where anything feels unclear or slow.

Live: https://turn-nimiq.vercel.app/
Repo: https://github.com/ometere123/turn

## X launch post

Built **turn** for the Nimiq Mini Apps Competition.

Take it. Use it. Turn it back. ↻

Pay a small NIM deposit for a reusable item. The payment becomes your receipt. Bring the item back and the merchant returns the same NIM to your authorised address.

No accounts. No custodial wallet. No fake escrow.

https://turn-nimiq.vercel.app/

## Tester request

I need Nimiq Pay users to test one complete flow: create or scan a counter, make one tiny deposit, wait for confirmation, return the receipt, and complete the refund. Please never retry a payment just because confirmation is slow. If anything is unclear, send the exact step and screenshot.

## Mainnet smoke gate

Do this only after the final deployed build is green:

1. Switch both Nimiq Pay wallets back to Mainnet and verify the orange TESTNET badge is gone.
2. Open the plain production URL, not `?network=testnet`.
3. Create a fresh counter using the smallest practical real-NIM amount you are comfortable spending.
4. Make exactly one deposit and wait for Ready to return.
5. Scan the receipt from the merchant wallet and refund exactly the same amount.
6. Confirm the customer receives the refund and turn reaches completed.
7. Do not repeat the payment if confirmation is slow; inspect Nimiq Pay first.

## Submission form fields still requiring the builder

- Designated lead name or pseudonym.
- GitHub profile link for each team member.
- Nimiq wallet address used for prize payout.
- Final demo video link if recorded.
- Final social/Skool post links after publishing.

## Final release rule

Do not submit only because CI is green. Complete the tiny Mainnet smoke gate, capture the final clean screenshots, keep production live, then submit the production URL and public repository before the Cycle II deadline.
