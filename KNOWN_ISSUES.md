# Known Issues

Tracking file for known bugs and issues. Not for feature requests.

---

## Bugs

### UI-001: Send confirmation amounts display incorrectly for multi-source NanoNym sends
**Severity:** Low (cosmetic)
**Component:** Send Component
**Status:** Open

When sending from a NanoNym using multiple stealth accounts, the confirmation view shows malformed amounts:
- `<0.01. XNO` instead of proper decimal
- `0. XNO` instead of `0 XNO` or actual balance

**Steps to reproduce:**
1. Have a NanoNym with funds across multiple stealth accounts
2. Send an amount requiring multiple accounts
3. Observe confirmation screen

---

### UI-002: Account selection shows stale balances in multi-source send
**Severity:** Medium
**Component:** Send Component / Account Selection
**Status:** Open

When preparing a multi-source NanoNym send:
- Account selection picks accounts based on cached balances
- One account may have zero balance on-chain (already spent)
- Send proceeds but skips the zero-balance account with warning
- UI showed 2 accounts but only 1 was used

**Observed log:**
```
[AccountSelection] Selection successful – {selectedCount: 2, ...}
[Send-NanoNym] Account has zero balance: nano_1u331... Skipping.
[Send-NanoNym] ✅ Complete: {totalSent: "1.23e+27", successCount: 1, ...}
```

**Expected:** Account selection should verify on-chain balances before confirming selection count.

---

## User Interface

### UX-001: Missing translations for NanoNym account details
**Severity:** Low (cosmetic)
**Component:** Account Details, i18n
**Status:** Fixed (pending verification after reload)

Missing translation keys:
- `account-details.nanonym-account`
- `account-details.nanonym-status`
- `account-details.nanonym-active`

**Fix applied:** Added to `src/assets/i18n/en.json`

---

## System Architecture

(No current issues)

---

## Notes

- Issues prefixed with component: `UI-`, `UX-`, `CRYPTO-`, `NOSTR-`, `ARCH-`
- Severity: Critical / High / Medium / Low
- Status: Open / In Progress / Fixed / Won't Fix
