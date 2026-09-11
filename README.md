# turn

**Pay the deposit. Bring the item back. Get the same NIM back.**

turn is a focused Nimiq Pay Mini App for refundable deposits on reusable items such as cups, containers, event gear, or other items a merchant expects back.

A customer scans a merchant counter, pays a NIM deposit, and receives a return receipt. When the item comes back, the merchant scans that receipt. turn independently verifies the original deposit on the Nimiq blockchain, derives the customer's refund address from that transaction, checks for an existing matching refund, and asks Nimiq Pay to return the exact deposit amount.

The full implementation and research closure are being committed in the next repository commit.
