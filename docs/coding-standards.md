# NanoNymNault: Coding Standards

This document defines **HOW** we write code in this project.

---

## TypeScript Patterns

### Determinism in Crypto Operations

**CRITICAL:** All cryptographic key derivation MUST be deterministic.

- Same seed + same index → identical keys (always)
- Test with both hex seeds (production format) and BIP-39 mnemonics (user import)

**Note to self:** Determinism applies ONLY to key derivation (for recovery). Wallet behavior CAN use randomness (spending order, timing) for privacy enhancement.

**Example:**
```typescript
// ✅ CORRECT: Deterministic key derivation
function deriveNanoNymKeys(seed: Uint8Array, accountIndex: number) {
  const path = `m/44'/165'/0'/1000'/${accountIndex}'`;
  return {
    spend: derivePath(path + '/0', seed),
    view: derivePath(path + '/1', seed),
    nostr: derivePath(path + '/2', seed)
  };
}

// ❌ WRONG: Non-deterministic randomness in key derivation
function deriveNanoNymKeys(seed: Uint8Array, accountIndex: number) {
  const randomSalt = crypto.getRandomValues(new Uint8Array(32)); // BREAKS RECOVERY
  return deriveWithSalt(seed, randomSalt);
}
```

### Randomness in Wallet Behavior

**Wallet behavior CAN use randomness** (spending order, timing) for privacy, as long as it doesn't affect key derivation.

**Example:**
```typescript
// ✅ CORRECT: Randomize spending order for privacy
function selectStealthAccountsForSend(accounts: StealthAccount[]): StealthAccount[] {
  const selected = greedySelection(accounts);
  return shuffleArray(selected); // Privacy enhancement
}
```

---

## Error Handling

### Logging Levels

Use appropriate logging levels:

- **ERROR:** Failures that prevent core functionality (e.g., all Nostr relays failed to publish)
- **WARN:** Degraded functionality but non-critical (e.g., one relay disconnected but others available)
- **INFO:** User-facing events (e.g., "Stealth account opened successfully")
- **DEBUG:** Developer-facing diagnostics (e.g., "Derivation path: m/44'/165'/0'/1000'/0'")

### Nostr Relay Failures

**DO NOT treat single relay failures as critical errors.**

Nostr uses 3-5 relays for redundancy. Log individual relay failures as WARN, only escalate to ERROR if ALL relays fail.

**Example:**
```typescript
// ✅ CORRECT: Graceful relay failure handling
async publishToRelays(event: Event) {
  const results = await Promise.allSettled(
    this.relays.map(relay => relay.publish(event))
  );
  
  const failures = results.filter(r => r.status === 'rejected');
  if (failures.length === this.relays.length) {
    console.error('[Nostr] All relays failed to publish event');
  } else if (failures.length > 0) {
    console.warn(`[Nostr] ${failures.length}/${this.relays.length} relays failed`);
  }
}

// ❌ WRONG: Treat single relay failure as critical
async publishToRelay(relay: Relay, event: Event) {
  try {
    await relay.publish(event);
  } catch (error) {
    console.error('[Nostr] Failed to publish'); // Too severe
    throw error; // Breaks redundancy
  }
}
```

---

## Testing Conventions

See [testing.md](testing.md) for comprehensive testing strategy.

### Unit Test Patterns

**ALWAYS test deterministic key derivation:**
```typescript
it('should derive identical keys from same seed + index', () => {
  const seed1 = hexToUint8('ABC123...');
  const seed2 = hexToUint8('ABC123...'); // Same seed
  
  const keys1 = deriveNanoNymKeys(seed1, 0);
  const keys2 = deriveNanoNymKeys(seed2, 0);
  
  expect(keys1.spend).toEqual(keys2.spend);
  expect(keys1.view).toEqual(keys2.view);
  expect(keys1.nostr).toEqual(keys2.nostr);
});
```

**Test both hex seeds and BIP-39 mnemonics:**
```typescript
it('should derive keys from hex seed', () => {
  const hexSeed = '0'.repeat(64); // 64-char hex
  const keys = deriveNanoNymKeys(hexToUint8(hexSeed), 0);
  expect(keys.spend).toBeDefined();
});

it('should derive keys from BIP-39 mnemonic', () => {
  const mnemonic = 'abandon abandon abandon ... art';
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const keys = deriveNanoNymKeys(seed, 0);
  expect(keys.spend).toBeDefined();
});
```

---

## Git Conventions

### Commit Message Format

**Subject line:** WHAT you intend to change and WHY it matters (the purpose/problem)  
**NOT:** Which files were modified  
**Focus:** The intent and value of the code change

**Good examples:**
```
Fix stealth account opening race condition

The immediate opening phase was failing when wallet was locked,
causing notifications to be lost. Add pending queue with unlock
subscriber to ensure all notifications are processed.
```

```
Add randomization to stealth account spending order

Deterministic spending order could leak privacy via timing
correlation. Randomize order while preserving greedy selection
algorithm for minimal account linkage.
```

**Bad examples:**
```
Update send.component.ts  # ❌ Doesn't explain WHY
```

```
Fix bug  # ❌ Too vague
```

### When to Commit

- After completing a logical unit of work
- Before switching to a different task
- When tests pass (or explicitly note if committing broken code for handoff)

### Branch Strategy

- **main:** Production-ready code
- **feature/*:** Feature development
- **fix/*:** Bug fixes
- **spike/*:** Experimental/research work (may be discarded)

---

## Code Style

### TypeScript

- Use TypeScript strict mode
- Avoid `any` type (use `unknown` if type is truly unknown)
- Prefer `const` over `let`
- Use arrow functions for callbacks

### Naming Conventions

- **Variables/Functions:** camelCase (e.g., `deriveNanoNymKeys`)
- **Classes/Interfaces:** PascalCase (e.g., `StealthAccount`)
- **Constants:** UPPER_SNAKE_CASE (e.g., `NANONYM_MASTER_PATH`)
- **Private members:** prefix with `_` (e.g., `_pendingBlocks`)

### File Organization

- One component/service per file
- Group related files in directories
- Use barrel exports (index.ts) for public APIs

---

## Comments

### When to Comment

**DO comment:**
- WHY you did something non-obvious (not WHAT the code does)
- Complex algorithms (reference papers/specs)
- Workarounds for bugs/limitations
- Security-critical sections

**DON'T comment:**
- Obvious code (`// Increment i` for `i++`)
- Redundant explanations of what the code does (code should be self-explanatory)

**Example:**
```typescript
// ✅ GOOD: Explains WHY
// Randomize order to prevent timing correlation attacks
return shuffleArray(selected);

// ❌ BAD: Restates WHAT
// Shuffle the array
return shuffleArray(selected);
```

---

## Security Best Practices

### Cryptographic Operations

- **NEVER** implement your own crypto primitives
- **ALWAYS** use well-audited libraries
- **ALWAYS** test key derivation with known test vectors
- **NEVER** log private keys or seeds (even in debug mode)

### Input Validation

- Validate all user input (addresses, amounts, etc.)
- Sanitize data before displaying in UI
- Use type guards for runtime type checking

**Example:**
```typescript
// ✅ CORRECT: Validate before use
function parseNanoNymAddress(address: string): NanoNymAddress | null {
  if (!address.startsWith('nnym_')) {
    return null;
  }
  if (address.length !== EXPECTED_LENGTH) {
    return null;
  }
  // ... additional validation
  return decoded;
}

// ❌ WRONG: Assume input is valid
function parseNanoNymAddress(address: string): NanoNymAddress {
  return decode(address); // May throw on invalid input
}
```

---

## Performance Guidelines

### Avoid Unnecessary Re-renders (Angular)

- Use `OnPush` change detection strategy where possible
- Memoize expensive computations
- Unsubscribe from observables in `ngOnDestroy()`

### Optimize Cryptographic Operations

- Batch operations when possible
- Use Web Workers for heavy computation (if available)
- Cache derived keys (with proper lifecycle management)

---

## Accessibility

- Use semantic HTML
- Provide ARIA labels where appropriate
- Ensure keyboard navigation works
- Test with screen readers (when possible)
