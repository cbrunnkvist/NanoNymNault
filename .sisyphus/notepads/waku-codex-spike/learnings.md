# Waku Content Topic Scheme - Learnings

## Task: Wave 1, Task 2 - Waku Content Topic Implementation
**Status:** ✅ COMPLETED  
**Commit:** e6a2d4a - feat(spike): add Waku content topic scheme (256 buckets + daily)

## Implementation Summary

### Files Created
1. **src/app/services/waku-topics.ts** (59 lines)
   - `deriveBucket(pubkey: Uint8Array): number` - Derives bucket 0-255 from pubkey
   - `deriveContentTopic(pubkey: Uint8Array, date: Date): string` - Formats topic string

2. **src/app/services/waku-topics.spec.ts** (201 lines)
   - 20+ unit tests covering all edge cases
   - Tests for determinism, bucket range, date formatting, UTC handling

### Key Design Decisions

#### 1. Bucket Derivation Strategy
- **Method:** First byte of BLAKE2b-256 hash of public key
- **Why:** Simple, deterministic, distributes uniformly across 256 buckets
- **Privacy:** Provides k-anonymity by grouping ~1/256 of users per bucket
- **Reference:** Matches Waku documentation recommendation for traffic distribution

#### 2. Content Topic Format
- **Format:** `/nanoNym/1/{bucket}/{date}/proto`
- **Components:**
  - `nanoNym` - Application name (prevents conflicts with other Waku apps)
  - `1` - Version (allows breaking changes in future)
  - `{bucket}` - 0-255 bucket number for traffic distribution
  - `{date}` - YYYY-MM-DD for daily partitioning
  - `proto` - Protocol Buffers encoding (Waku recommended)

#### 3. Date Handling
- **UTC-based:** Uses `getUTCFullYear()`, `getUTCMonth()`, `getUTCDate()`
- **Padding:** Zero-pads month and day (01-12, 01-31)
- **Default:** Defaults to today's date if not provided
- **Why UTC:** Ensures consistent topic derivation across timezones

### Testing Strategy

#### Unit Tests (20+ cases)
- ✅ Bucket range validation (0-255)
- ✅ Determinism (same input → same output)
- ✅ Differentiation (different inputs → different outputs)
- ✅ Edge cases (all-zero, all-ones pubkeys)
- ✅ Date formatting (padding, leap years, year-end)
- ✅ UTC handling
- ✅ Format validation (regex matching)
- ✅ Integration tests (bucket + topic together)

#### Manual Verification
- Tested with Node.js directly (no browser needed)
- Verified acceptance criteria:
  - `bucket` is number 0-255 ✅
  - `topic` matches `/nanoNym/1/\d+/2025-02-01/proto` ✅

### Cryptographic Foundation

#### BLAKE2b Hash Function
- **Source:** `blakejs` library (already used in nanonym-crypto.service.ts)
- **Output:** 32 bytes (256 bits)
- **First byte:** Used as bucket (0-255)
- **Properties:**
  - Deterministic (same input always produces same output)
  - Uniform distribution (first byte is random-looking)
  - Fast (optimized for performance)
  - Cryptographically secure (resistant to collisions)

### Privacy Implications

#### k-anonymity
- **Single bucket:** All users in bucket share same content topic
- **k-value:** ~1/256 of total users per bucket
- **Example:** 10,000 users → k ≈ 39 per bucket
- **Benefit:** Prevents adversaries from identifying individual users by content topic

#### Traffic Distribution
- **Without buckets:** All notifications on single topic → high traffic concentration
- **With 256 buckets:** Traffic distributed across 256 topics → harder to analyze
- **Daily partitioning:** Further reduces correlation between dates

### Compatibility Notes

#### Waku Protocol Compliance
- ✅ Follows RFC WAKU2-TOPICS specification
- ✅ Uses recommended naming format
- ✅ Supports Protocol Buffers encoding
- ✅ Compatible with Waku Filter, Store, and Light Push protocols

#### Integration Points
- Uses existing `blakejs` dependency (no new dependencies)
- Follows project's TypeScript conventions
- Matches existing crypto service patterns
- Ready for integration with Waku message routing

## Lessons Learned

### 1. Bucket Distribution
- First byte of hash provides excellent distribution
- No need for complex bucketing algorithms
- Simple = maintainable = fewer bugs

### 2. Date Handling
- Always use UTC for distributed systems
- Zero-padding is essential for consistent formatting
- Default parameter (today) is convenient for most use cases

### 3. Testing Approach
- Determinism tests are critical for cryptographic functions
- Edge cases (all-zero, all-ones) reveal implementation issues
- Integration tests verify components work together

### 4. Documentation
- Waku documentation is clear and well-structured
- Privacy implications of content topics are important to understand
- k-anonymity concept is key to privacy design

## Next Steps (Not in Scope)

1. **Integration with Waku client** - Connect to actual Waku network
2. **Message encryption** - Implement NIP-17 encrypted payloads
3. **Relay selection** - Choose which relays to publish to
4. **Performance optimization** - Benchmark bucket distribution
5. **Privacy analysis** - Formal k-anonymity evaluation

## Files Modified
- ✅ Created: `src/app/services/waku-topics.ts`
- ✅ Created: `src/app/services/waku-topics.spec.ts`
- ✅ Committed: `e6a2d4a` with proper message format

## Verification Checklist
- ✅ Functions implement correct algorithm
- ✅ Bucket range is 0-255
- ✅ Content topic format matches specification
- ✅ Date formatting is correct (YYYY-MM-DD)
- ✅ Determinism verified
- ✅ Unit tests comprehensive
- ✅ TypeScript compiles without errors
- ✅ Acceptance criteria met
- ✅ Commit message follows project style
