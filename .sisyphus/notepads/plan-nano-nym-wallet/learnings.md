Task: Add refreshAllBalances() call when wallet unlocks in anonym-manager.service.ts

- Change: In the wallet unlock subscription, call refreshAllBalances() after processing pending stealth blocks.
- Rationale: Ensure stealth balances are refreshed immediately after pending stealth blocks are processed to avoid stale balance data.
- Result: Balances are accurate after unlock and UI reflects updated stealth balances.
