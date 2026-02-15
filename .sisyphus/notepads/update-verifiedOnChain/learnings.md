# Learnings - update verifiedOnChain persistence

- Implemented support for persisting a new field verifiedOnChain on stealth accounts.
- Updated StoredStealthAccount interface to include verifiedOnChain (optional for backward-compat).
- Updated serialization (serializeStealthAccount) to write verifiedOnChain.
- Updated deserialization (deserializeStealthAccount) to read verifiedOnChain with a safe default of false when missing.
- Backward compatibility: existing storage without verifiedOnChain continues to load with verifiedOnChain = false.
