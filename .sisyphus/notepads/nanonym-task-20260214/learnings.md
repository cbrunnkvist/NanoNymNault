Learnings from task: Implement verifiedOnChain flag setting for stealth accounts.
- Atomic task approach used: one code change in processNotification to derive verifiedOnChain from accountInfo results and include it in StealthAccount.
- Storage layer already persisted verifiedOnChain in StoredStealthAccount; no changes needed there beyond ensuring compatibility.
- Verification steps performed: updated code patch, added a Todo item for traceability, and confirmed lsp diagnostics show no immediate errors.

NEXT STEPS (if needed):
- Run build/tests to ensure end-to-end stability.
- Consider adding unit tests covering both unopened and opened on-chain scenarios.

2026-02-14:
- NanoNym aggregate balance is now computed from stealth accounts on load/update and not persisted in localStorage.
- Storage deserialization remains backward-compatible with older payloads that might include extra fields.
