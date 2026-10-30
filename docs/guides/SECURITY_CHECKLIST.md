# ChinaSuuq — Security & AI Safety Checklist (Phase 4)

- Treat marketplace pages and uploaded documents as UNTRUSTED input; page text is data, never instructions.
- Extraction AI has no operational tools (enforced server-side via AI_POLICIES extraction.toolsEnabled=false).
- Never send marketplace passwords, OTPs, or private page data to translation services.
- No database of customers' marketplace credentials; session storage only via platform-native mechanisms.
- Payment screenshot = evidence of a claim, not proof of settlement; only provider confirmation marks funds received.
- Image analysis may flag visible damage, possible color mismatch, missing visible accessories — never certifies material quality/authenticity/exact counts.
- External fetching: validate domains + redirects, block internal/private addresses (SSRF), restrict content types/sizes, apply timeouts.
- WebView bridge: validate message structure/size, check origin, bind responses to navigation ids, discard stale responses, expose no privileged native methods.
- Permission enforcement during retrieval, not merely in the assistant prompt.
- No arbitrary AI-generated SQL, no direct AI mutation of finance tables, no autonomous refunds/payments/supplier payments/mass messaging.
- High-impact actions require explicit approval (+ second approver where required, per missionControl.ts).
- Rewards/warnings: label machine-generated translations; versioned terminology; numbers, units, model codes, and SKU identifiers are never translated.
