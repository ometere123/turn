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

A merchant creates a return counter with an item, a NIM deposit amount, and a receiving wallet. The customer scans the counter, reviews the exact payment, and approves the deposit in Nimiq Pay. The original blockchain transaction becomes the receipt.

When the item is returned, the merchant scans the customer’s receipt. turn independently verifies the original deposit on Nimiq, derives the customer and exact refund amount from that transaction, checks whether a matching refund already exists, and then asks Nimiq Pay to send the refund. turn only marks the cycle complete after the matching refund is found on-chain.

turn never holds funds, stores private keys, or pretends to be escrow. Payments stay directly between customer and merchant. The app is intentionally focused on one repeatable loop: deposit → receipt → return → refund.

## What to show in the demo

Target length: 45–60 seconds.

1. Open turn inside Nimiq Pay and show the two modes: Return and Counter.
2. On Counter, authorise the merchant wallet and create a counter for a reusable cup with a small NIM deposit.
3. Show the counter QR.
4. On the customer wallet, scan the counter and show the exact merchant, item, NIM amount, and native Nimiq Pay approval.
5. Show the saved return receipt after the transaction is confirmed.
6. Back on the merchant wallet, scan that receipt and show the verified original deposit details.
7. Approve the exact refund in Nimiq Pay.
8. Finish on the completed state where turn has found the matching refund on-chain.

Narration: “turn replaces awkward cash deposits for reusable items with a tiny NIM loop. The customer pays the merchant directly, the deposit transaction becomes the receipt, and when the item comes back turn verifies that transaction and guides the merchant through the exact refund. No accounts, no backend custody, no private keys, and no fake escrow claims.”

## Skool launch post

Built **turn** for Cycle II.

The idea is deliberately small: a café, event, or venue can take a refundable NIM deposit for a reusable item, then return that exact amount when the item comes back. The original Nimiq transaction is the receipt, so turn can verify the customer, merchant, amount, and refund without holding funds itself.

I’m looking for real Nimiq Pay testers now. Please try the full deposit → receipt → return → refund flow and tell me where anything feels unclear or slow.

Live: https://turn-nimiq.vercel.app/
Repo: https://github.com/ometere123/turn

## X launch post

Built **turn** for the Nimiq Mini Apps Competition.

Pay a small NIM deposit for a reusable item. Bring it back. Get the same NIM back.

The payment itself becomes the receipt, and turn verifies the refund on-chain. No accounts, no custodial wallet, no fake escrow.

https://turn-nimiq.vercel.app/

## Tester request

I need Nimiq Pay users to test one complete flow: create or scan a counter, make a tiny deposit, return the receipt, and complete the refund. If you hit a confusing label, slow state, failed camera permission, wallet cancellation issue, or verification problem, please send the exact step and screenshot. Genuine usage and specific feedback are more valuable than repeated self-testing.

## Submission form fields still requiring the builder

- Designated lead name or pseudonym.
- GitHub profile link for each team member.
- Nimiq wallet address used for prize payout.
- Final demo video link if recorded.
- Final social/Skool post links after publishing.

## Final release rule

Do not submit only because CI is green. Complete the real-device release gate in `docs/TEST-MATRIX.md`, keep the production deployment live, then submit the production URL and public repository before the Cycle II deadline.
