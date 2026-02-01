# NanoNymNault Documentation Index

This is your guide to the NanoNymNault documentation structure.

---

## Start Here

- **[README.md](../README.md)** - Project overview and getting started
- **[AGENTS.md](../AGENTS.md)** - Agent instructions (Prime Directives, build environment, commit format)

---

## Core Documentation

### Understanding the Design (WHY)

**[project-context.md](project-context.md)** - Architectural decisions and reasoning
- Problem statement and solution approach
- Why we chose off-chain notifications (Nostr) vs alternatives
- Privacy model and explicit trade-offs
- Why multi-tier recovery strategy
- Spending constraints and why they exist

### Understanding the Protocol (WHAT)

**[protocol-specification.md](protocol-specification.md)** - Protocol specification
- NanoNym address format (`nnym_`)
- Send and receive workflows
- Stealth account selection algorithm
- Account management and UI requirements
- Privacy warnings and Privacy Mode

### Implementation Details (HOW)

**[implementation-notes.md](implementation-notes.md)** - Technical implementation
- Key derivation paths and seed format detection
- Cryptography (Ed25519, Secp256k1, BLAKE2b)
- Nostr integration details
- Three-phase stealth account opening strategy
- Performance and security considerations

**[coding-standards.md](coding-standards.md)** - How we write code
- TypeScript patterns and determinism vs randomness
- Error handling and logging levels
- Testing conventions
- Git commit message format

### Project Status (STATUS)

**[roadmap.md](roadmap.md)** - Implementation roadmap
- Completed phases (crypto core, Nostr integration, UI, stealth account opening)
- Planned phases (Privacy Mode, consolidation tools, E2E tests)
- Test coverage status

**[testing.md](testing.md)** - Testing strategy
- Unit tests, integration tests, E2E tests
- Manual testing procedures
- Test running instructions

---

## Supporting Documentation

### Design Analysis

- **[ANALYSIS-CAMONANO-ALTERNATIVES.md](ANALYSIS-CAMONANO-ALTERNATIVES.md)** - Deep dive into alternative approaches (IPFS, Ceramic, etc.)
- **[KEY-DERIVATION.md](KEY-DERIVATION.md)** - Cryptographic key derivation architecture

### Planning & Research

- **[IPFS-SPIKE-PLAN.md](IPFS-SPIKE-PLAN.md)** - IPFS integration planning
- **[IPFS-SPIKE-SUMMARY.md](IPFS-SPIKE-SUMMARY.md)** - IPFS spike findings
- **[IPFS-SPIKE-LEARNINGS.md](IPFS-SPIKE-LEARNINGS.md)** - Lessons from IPFS investigation
- **[IPFS-BACKUP-SPECIFICATION.md](IPFS-BACKUP-SPECIFICATION.md)** - IPFS backup mechanism spec
- **[CERAMIC-SPIKE-LEARNINGS.md](CERAMIC-SPIKE-LEARNINGS.md)** - Ceramic protocol investigation
- **[CERAMIC-BACKUP-SPECIFICATION.md](CERAMIC-BACKUP-SPECIFICATION.md)** - Ceramic backup mechanism spec
- **[BLOCKCHAIN-SCANNABLE-VARIANT.md](BLOCKCHAIN-SCANNABLE-VARIANT.md)** - Alternative blockchain-scannable design
- **[SESSION-HANDOFF.md](SESSION-HANDOFF.md)** - Session handoff notes (Phase 2 implementation)

### Testing & QA

- **[MANUAL-TEST-PLANS.md](MANUAL-TEST-PLANS.md)** - Manual testing procedures
- **[E2E-TEST-IDS.md](E2E-TEST-IDS.md)** - E2E test ID reference
- **[NAULT-TESTS.md](NAULT-TESTS.md)** - Analysis of inherited Nault test suite

---

## External Documentation

### Protocol References

- **[NIP-17](https://github.com/nostr-protocol/nips/blob/master/17.md)** - Nostr "gift wrap" standard
- **[BIP-352](https://github.com/bitcoin/bips/blob/master/bip-0352.mediawiki)** - Silent Payments
- **[CamoNano](https://github.com/CamoNano)** - Original Nano stealth address implementation

### Nano Documentation (in references/)

- **references/nano-docs/** - Full Nano protocol documentation

---

## Quick Decision Guide

**I need to understand...**
- **Why we chose Nostr instead of on-chain notifications** → project-context.md
- **How to derive keys from a seed** → implementation-notes.md (Section 1)
- **What the `nnym_` address format looks like** → protocol-specification.md (Section 2)
- **How to handle stealth account opening** → implementation-notes.md (Section 4)
- **When to warn users about privacy impact** → protocol-specification.md (Section 7)
- **What the current implementation status is** → roadmap.md
- **How to write a proper commit message** → coding-standards.md

---

## Notes for AI Assistants

- **CLAUDE.md** was the original comprehensive spec (now split into these files)
- **Determinism applies ONLY to key derivation** (same seed + index = same keys)
- **Randomness is used for wallet behavior** (account selection order, timing) for privacy
- **Critical invariant:** Send → Receive → Stealth funds spendable (NEVER BREAK)
