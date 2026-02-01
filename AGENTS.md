# NanoNymNault Agent Instructions

**Target agent:** Claude Code, Gemini, any AI assistant  
**Project:** Privacy-preserving Nano wallet using stealth addresses + Nostr notifications  
**Constraint:** No changes to Nano protocol (pure wallet/off-chain coordination)

---

## Prime Directives

### 1. Critical Invariant (NEVER BREAK)

The core path must always work:

```
Send to NanoNym → Receive via Nostr → Stealth funds spendable and recoverable from seed alone
```

This workflow must remain correct, test-covered, and never broken by any changes.

### 2. Determinism Requirement

**Key derivation MUST be deterministic:**
- Same seed + same index → identical keys (always)
- Test with both hex seeds (64-char hex) and BIP-39 mnemonics
- Any deviation breaks recovery

### 3. Build Environment

- **Package manager:** npm (NOT yarn/pnpm)
- **Node version:** v20 (via nvm - see .nvmrc)
- **Python version:** 3.11 (for native module compilation)
- **Build flags required:**
  ```bash
  npm_config_arch=x64 \
  PYTHON=/opt/homebrew/opt/python@3.11/bin/python3.11 \
  npm ci
  ```

### 4. npm Usage

**ALWAYS** use `nvm exec npm [args]` (except in CI).  
You may need to `source ~/.nvm/nvm.sh` if the alias isn't present.

### 5. Commit Message Format

- **Subject line:** WHAT you intend to change and WHY it matters (the purpose/problem)
- **NOT:** Which files were modified
- **Focus:** The intent and value of the code change
- **Example:**
  ```
  Fix stealth account opening race condition
  
  The immediate opening phase was failing when wallet was locked,
  causing notifications to be lost. Add pending queue with unlock
  subscriber to ensure all notifications are processed.
  ```

---

## Documentation Map

All architectural decisions, protocol details, and implementation notes are in separate files:

- **[docs/project-context.md](docs/project-context.md)** - WHY: Architectural decisions, privacy model, design rationale
- **[docs/protocol-specification.md](docs/protocol-specification.md)** - WHAT: Address format, workflows, account model
- **[docs/implementation-notes.md](docs/implementation-notes.md)** - HOW: Cryptography, key derivation, technical details
- **[docs/coding-standards.md](docs/coding-standards.md)** - HOW: TypeScript patterns, testing conventions
- **[docs/roadmap.md](docs/roadmap.md)** - STATUS: Implementation status and next steps
- **[docs/testing.md](docs/testing.md)** - Testing strategy and instructions

---

## Quick Reference

- **Live preview:** https://cbrunnkvist.github.io/NanoNymNault/
- **Test suite:** `npm test` (requires Brave Browser + Node v20)
- **Dev server:** `npm start` → http://localhost:4200/
- **See docs/README.md for full documentation index**
