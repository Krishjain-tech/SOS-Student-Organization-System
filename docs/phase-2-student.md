# Future student interface

This phase deliberately contains only `/admin` and `/volunteer` interfaces. There is no public registration, membership checkout, storefront, ticket checkout, or student homepage.

## Coverage of the supplied domain PDF

| PDF workflow | Administrative/volunteer implementation | Prepared shared structures | Deferred student work |
|---|---|---|---|
| A new student joins | Member records, dated membership terms, manual dues settlement, renewal history, expiry/reminder handling | Optional member-to-user linkage; eligibility derived from paid terms and dates | Public signup, account verification, student membership checkout |
| Spring Gala tickets | Event pricing/capacity, manual ticket sales, server-validated code check-in, event totals | Ticket owner linkage, immutable sale price, payment/ledger source | Online ticket purchases and gateway verification |
| Meeting announcements | Draft/publish/archive, volunteer notifications, persistent simulated email queue | Audience, publication time, delivery dedupe keys | Public announcement page and actual email delivery |
| Ordering hoodies | Variants, sizes, stock history, counter orders, collected status | Immutable order unit prices, member discount services, settlement references | Student shop and checkout |
| Planning a fundraiser | Availability requests/responses, separate assignments, tasks, budgets, deadlines, volunteer updates | Event links across assignments, tasks, income, and claims | Public fundraiser landing pages |
| Treasurer reporting | Settled cash ledger, claim obligations, private receipts, payment recording, CSV, reversals | Linked financial sources, append-only ledger and audit | Online payment intents, webhooks, refund processing |

## Safe extension points

- Add a separately authorized `student` role through a versioned migration; never infer it from membership or a client-provided role.
- Reuse `member_records.user_id`; preserve records for members who never create accounts. Avoid duplicate people when a volunteer later becomes a student user.
- Reuse paid/date-valid membership eligibility for server-calculated ticket and product prices.
- Introduce `payment_intents` and provider-event tables separate from `payments`. Only verified settled provider events create ledger movements. Include unique provider IDs, actor-scoped request idempotency, webhook signature verification, and capacity/stock reservation expiry.
- Keep receipt delivery private. A future public asset store must not expose claim evidence.
- Online refunds need a coherent full/partial refund service with immutable original prices and linked outgoing movements. Event cancellation currently flags unresolved ticket refunds; it does not execute a bank transfer.
- Add consent/subscription and verified-recipient fields before connecting a real mail transport. The present mock outbox sends nothing.
- Add public routes only when their service and permission rules are ready. No empty student routes exist in this phase.

The full PDF is not claimed complete; public and online workflows above remain phase 2.
