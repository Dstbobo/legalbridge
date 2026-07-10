# LegalBridge Premium — Concept & Roadmap

Locked as direction on July 4, 2026. NOT being built yet — the `plan` column
('free' | 'premium') already exists on `profiles` and in the app's user model,
so every new feature should be designed with the gate in mind.

## Tiers

| Free forever | Premium (subscription) | Pay-per-use (commission) |
|---|---|---|
| News Hub + AI reports | Unlimited document drafting | Lawyer consultations (booking fee / % commission) |
| Basic AI questions (daily cap later) | Unlimited voice conversation minutes | |
| Opportunities directory | Priority, longer AI answers | |
| Lawyer directory browsing | Early access to new features | |
| Mentorship (students) | | |

## Revenue order of attack
1. **Lawyer-consultation commission first.** Payment for real-world services may
   use Paystack/Flutterwave directly — Google takes 0%. The verified-lawyer
   directory is the marketplace; add paid booking when consultation volume shows up.
2. **Premium subscription second**, once usage data shows what users hit limits on.

## Critical compliance rule
In-app **digital** subscriptions (premium tier) MUST use Google Play Billing
(15–30% cut). Payments for **physical-world services** (lawyer consultations)
may use external processors (Paystack). Never mix these up in implementation —
routing digital subscriptions around Play Billing gets the app removed.

## Implementation notes (when the time comes)
- Gate checks read `profiles.plan` server-side (edge functions) — never trust the client.
- Usage caps: count per-user daily requests in a table; enforce in chat-stream.
- Paystack for consultations: booking row + webhook edge function to confirm payment.
