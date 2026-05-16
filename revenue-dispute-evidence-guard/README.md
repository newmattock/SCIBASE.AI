# Revenue Dispute Evidence Guard

Revenue infrastructure needs controls for the moments after billing succeeds or fails: card disputes, invoice short-payments, failed top-ups, and license access that should pause until finance has enough evidence to recover revenue. This module adds a deterministic chargeback and payment-dispute evidence guard for institutional revenue operations.

The guard is self-contained and credential-free. It consumes synthetic customer, invoice, payment, entitlement, and usage records, then emits:

- dispute and failed-payment findings with severity and recovery deadlines
- entitlement hold/release decisions for subscriptions, compute top-ups, and data licenses
- payment-rail evidence packets for Stripe, PayPal, and institutional invoice workflows
- finance actions prioritized by revenue at risk and due date
- deterministic audit digests for reviewer-ready validation

## Run

```bash
npm run check
npm test
npm run demo
```

The demo reads `data/sample-revenue-input.json`. Visual review artifacts are in `docs/demo.svg` and `docs/demo.gif`.

## Fit For Issue #20

This targets the Revenue Infrastructure requirements for secure payment integrations, institutional invoicing, subscription billing, AI compute usage, top-ups, and licensing API revenue. It is distinct from prior billing, metering, entitlement, procurement, licensing, tax, margin, renewal, and revenue-recognition slices because it focuses on payment reversals, evidence readiness, dispute deadlines, and entitlement holds after payment risk appears.
