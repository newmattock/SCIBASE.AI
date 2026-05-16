# Requirement Map

| Issue #20 capability | Implementation evidence |
| --- | --- |
| Secure payment integrations | Stripe, PayPal, and institutional invoice rails are modeled in `data/sample-revenue-input.json` and packetized by `evidencePackets()` |
| Subscription billing | customer tiers, invoice line items, and active entitlements are connected to payment risk |
| AI compute billing and top-ups | `ai_compute_topup` entitlement and compute usage events are included in entitlement hold decisions |
| Institutional invoicing | short-paid institutional invoice flow requires purchase order and invoice PDF evidence |
| Licensing APIs and analytics | analytics API license entitlement is paused when PayPal funding fails |
| Revenue sustainability | `revenueAtRiskUsd`, finance actions, due dates, and deterministic digests prioritize recovery work |

## Distinctness

This module is not another billing ledger, metering engine, entitlement calculator, procurement control, privacy-safe licensing gate, tax exemption checker, margin guard, renewal true-up, or revenue-recognition close. It focuses on post-billing payment risk: disputes, short-payments, failed payments, evidence packets, and entitlement holds.
