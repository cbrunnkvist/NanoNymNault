# E2E Testing Quick Start Guide

## TL;DR

After the recent cryptographic breakthrough, the NanoNym protocol now has a **fully working nano→nnym→nano roundtrip**.

All 4 E2E tests are documented and ready to execute. You're now at the **verification phase**.

## Current Status ✅

| Component | Status | Date |
|-----------|--------|------|
| Schnorr Signatures | ✅ Fixed | Nov 19 |
| Stealth Account Opening | ✅ Working | Nov 19 |
| Stealth Account Spending | ✅ Working | Nov 19 |
| Test Documentation | ✅ Complete | Nov 20 |

## What You Need to Do

### Option A: Quick Smoke Test (15 mins)
1. Open two browser windows (WalletA and WalletB)
2. Send **1 payment** to a NanoNym from WalletA
3. Verify it appears in WalletB with correct balance
4. Try to spend it back to WalletA
5. ✅ If successful, core functionality works!

### Option B: Full E2E Test 3 (45 mins)
1. Follow `E2E_TEST_3_MULTI_PAYMENT.md`
2. Send **3 payments** (1.0, 0.5, 2.0 XNO) to same NanoNym
3. Verify:
   - [ ] 3 stealth accounts created (different addresses)
   - [ ] Aggregated balance = 3.5 XNO
   - [ ] Payment count = 3 payments
   - [ ] All accounts spendable

### Option C: Comprehensive Tests 3 & 4 (2-3 hours)
1. Execute E2E Test 3 (multi-payment scenario)
2. Execute E2E Test 4 (balance persistence)
3. Document any edge cases or issues
4. Report findings

## File Reference

| Document | Purpose | Read Time |
|----------|---------|-----------|
| `E2E_TESTING_SUMMARY.md` | Overview of all tests and achievements | 10 min |
| `E2E_TEST_3_MULTI_PAYMENT.md` | Step-by-step guide for Test 3 | 20 min |
| `E2E_TEST_4_BALANCE_PERSISTENCE.md` | Step-by-step guide for Test 4 | 20 min |
| `CLAUDE.md` | Protocol specification | 30 min |

## Key Metrics to Watch

During testing, monitor:

1. **Balance Accuracy**: Does 1.0 + 0.5 + 2.0 = 3.5?
2. **Signature Correctness**: Any "Bad signature" in console?
3. **Nostr Latency**: How quickly do notifications arrive?
4. **Recovery Speed**: How long to reload and restore balances?

## Console Debugging

Open DevTools (F12) → Console to watch:

```javascript
// Successful stealth account opening:
[NanoNym] ✅ Stealth account opened for NanoNym: nano_1...

// Successful send from stealth:
[Send-NanoNym] ✅ Transaction sent: [tx_hash]

// Successful balance aggregation:
[NanoNym] Aggregated balance: 3.5 XNO (3 payments)

// Successful page reload recovery:
[NanoNym] Reconstructing stealth accounts from storage
[NanoNym] ✅ Stealth account restored: nano_1...
```

## Common Issues & Solutions

| Symptom | Cause | Solution |
|---------|-------|----------|
| "Bad signature" in console | Algorithm mismatch | Check crypto service using Schnorr (not EdDSA) |
| Balance shows 0 XNO | Stealth account not opened | Wait for Nostr notification & receive block confirmation |
| Page reload loses balance | localStorage not syncing | Check browser storage in DevTools → Application |
| Cannot spend from stealth | Missing isStealthAccount flag | Check send.component.ts has flag on tempAccount |

## Next Action

Pick your testing approach above and follow the corresponding guide. **All documentation is ready to use—no code changes needed!**

---

**Last Updated**: 2025-11-20
**Session Status**: Breakthrough complete, E2E testing framework ready
**Next Phase**: Execution & validation
