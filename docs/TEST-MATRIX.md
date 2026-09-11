# turn — acceptance and failure matrix

The unit suite is necessary but not sufficient. Wallet and WebView behaviours must be tested on the current Nimiq Pay build before competition submission.

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

## Real-device Gate 0

Do these before cosmetic expansion or competition submission:

| # | Test | Pass condition |
|---|---|---|
| 1 | open production HTTPS URL in Nimiq Pay | provider initialises without console error |
| 2 | `listAccounts()` | native confirmation appears; rejection returns controlled UI |
| 3 | create counter | selected receiving account survives refresh |
| 4 | scan counter QR | correct merchant/item/amount shown |
| 5 | cancel deposit | nothing marked paid; retry works |
| 6 | make tiny real deposit | SDK returns tx hash |
| 7 | verify deposit | light client reaches consensus and finds correct included tx/data |
| 8 | reload customer | receipt still available |
| 9 | recover by tx hash | receipt reconstructs financial state |
| 10 | camera denied | paste fallback remains fully usable |
| 11 | scan receipt on merchant | original customer, merchant, value derived from chain |
| 12 | cancel refund | deposit stays refundable |
| 13 | make exact real refund | prefer the same account that received deposit and confirm sender shown in Nimiq Pay |
| 14 | verify refund | matching included tx marks receipt complete |
| 15 | scan receipt again | app says already refunded and does not request another payment |

## Adversarial checks

- edit the amount in a copied counter URL before paying;
- replace the merchant address with an invalid address;
- give merchant a random Nimiq transaction hash;
- give merchant a valid non-turn payment hash;
- give merchant another merchant's turn deposit;
- alter the refund QR/link text;
- attempt refund while the original merchant wallet is not authorised;
- approve refund from a different merchant account if Nimiq Pay allows sender selection; turn must still recognise the exact-value, exact-nonce payment to the original customer and must not request a second refund;
- tap Pay/Refund repeatedly while wallet sheet is opening;
- lose light-client consensus mid-verification;
- refresh during a `submitted` deposit;
- deny camera permission permanently;
- disable Clipboard API and verify manual selection/paste is still usable.

## Known non-goal

Cross-device atomic duplicate-refund prevention is not claimed. Test copy explicitly and documentation must remain truthful about that boundary.
