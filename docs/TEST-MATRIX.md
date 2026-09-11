# turn — acceptance and failure matrix

The automated suite is necessary but not sufficient. Wallet, camera, WebView, and real transaction behaviour must be tested on the current Nimiq Pay build before competition submission.

Production URL: https://turn-nimiq.vercel.app/

## Automated

| Area | Case | Expected |
|---|---|---|
| money | whole NIM → Luna | exact integer conversion |
| money | five decimals | exact integer conversion |
| money | >5 decimals | rejected |
| protocol | deposit marker | parses same nonce |
| protocol | refund marker | compact and deterministic |
| protocol | raw transaction data | hex decodes to marker |
| protocol | counter URL | public counter fields round-trip |
| protocol | return URL | only transaction hash is authoritative |
| network | `MainAlbatross` vs `main-albatross` | treated as same network |

## Real-device release gate

Run the full flow inside the current Nimiq Pay app with two different wallets. Use Testnet first if the current app supports switching to TestAlbatross, then repeat one tiny deposit/refund smoke cycle on MainAlbatross before final submission.

| # | Test | Pass condition |
|---|---|---|
| 1 | open production HTTPS URL in Nimiq Pay | provider initialises and the app shows Nimiq Pay rather than Preview |
| 2 | authorise merchant wallet | native account confirmation appears; rejecting it returns controlled UI |
| 3 | create counter | selected receiving account, merchant, item, and amount display correctly |
| 4 | refresh merchant screen | saved counter remains available |
| 5 | customer scans counter QR | correct merchant, item, amount, and receiving address are shown before approval |
| 6 | cancel deposit | nothing is marked paid; retry remains available |
| 7 | make tiny deposit | native approval succeeds and SDK returns a transaction hash |
| 8 | verify deposit | light client reaches consensus and finds the included transaction with exact recipient, value, network, and deposit marker |
| 9 | reload customer | submitted/active receipt remains available on the device |
| 10 | recover by transaction hash | receipt reconstructs authoritative financial state from chain |
| 11 | camera denied | paste fallback remains fully usable |
| 12 | merchant scans return receipt | original customer, merchant, amount, and nonce are derived from chain rather than QR fields |
| 13 | wrong merchant wallet authorised | refund review refuses to proceed for a deposit received by another merchant wallet |
| 14 | cancel refund | deposit remains refundable and no completion state is shown |
| 15 | make exact refund | native approval sends the original amount to the original customer with the matching refund marker |
| 16 | verify refund | included matching transaction marks the receipt complete |
| 17 | scan receipt again | app reports the existing refund and does not request another payment |
| 18 | repeat one tiny cycle on MainAlbatross | production payment and refund loop completes end to end |

## Adversarial checks

- Edit the amount in a copied counter URL before paying and confirm the altered value is what the customer is explicitly shown before native wallet approval.
- Replace the merchant address with an invalid address and confirm payment is blocked.
- Give the merchant a random Nimiq transaction hash.
- Give the merchant a valid non-turn payment hash.
- Give the merchant another merchant's turn deposit.
- Alter return-link text around the transaction hash and confirm only a valid deposit transaction is accepted.
- Attempt refund while the original merchant wallet is not authorised.
- If Nimiq Pay allows choosing another authorised merchant sender for the refund, confirm turn still recognises the exact-value, exact-nonce payment to the original customer and never requests a second refund.
- Tap Pay or Refund repeatedly while the native wallet sheet is opening.
- Interrupt or lose light-client consensus during verification.
- Refresh during a `submitted` deposit.
- Deny camera permission permanently.
- Disable Clipboard API and verify manual selection/paste remains usable.

## Release decision

Do not describe the product as fully acceptance-tested until the real-device gate above has been completed. A green CI build proves source-level quality gates, not Nimiq Pay wallet acceptance.

## Known non-goal

Cross-device atomic duplicate-refund prevention is not claimed. turn prevents accidental duplicates on one device and rechecks the chain before refunding, but two merchant devices could still race before either refund is included. Product copy and competition materials must remain truthful about that boundary.
