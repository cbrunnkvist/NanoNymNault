# NanoNym Key Derivation Architecture

## Overview

This document describes the current NanoNym derivation model used by NanoNymNault and the extracted `@nanomyms/*` packages.

NanoNyms are **v2-only**:

- the protocol format is `nnym_`
- the address embeds `B_spend`, `B_view`, and a generic `notificationUri`
- NanoNymNault currently uses `nostr:...` as its Tier 1 notification route
- there is no dual v1/v2 support path in the wallet or packages

For the exact `nnym_` byte layout, see [rfcs/0001-generic-tier1-notification-uri.md](rfcs/0001-generic-tier1-notification-uri.md).

## Deterministic Seed Model

Critical invariant:

- same seed + same NanoNym index = identical keys

Supported seed inputs:

- 64-character hex Nano seeds
- BIP-39 mnemonics

The extracted crypto package normalizes either form to seed bytes and derives all NanoNym key material deterministically.

## Derivation Paths

NanoNymNault uses a Nano-scoped namespace beneath the wallet seed:

```text
m / 44' / 165' / 0' / 1000' / <nanonym_index>' / <key_type>
```

Key types:

- `0` -> spend keypair (`b_spend`, `B_spend`)
- `1` -> view keypair (`b_view`, `B_view`)
- `2` -> notification helper key material used by NanoNymNault's current `nostr:` adapter

Notes:

- spend and view keys are Ed25519
- NanoNymNault currently derives Nostr-compatible notification material from the same root seed for convenience
- the protocol does not require Nostr specifically; it only stores a `notificationUri`

## What Is Embedded In `nnym_`

At the derivation layer, only the public components needed for receiving are exported into the address:

- `B_spend`
- `B_view`
- `notificationUri`

Private material is never embedded.

That means a NanoNym address is sufficient for:

- parsing recipient metadata
- deriving a payment-specific stealth destination
- routing the Tier 1 notification through an adapter

But it is not sufficient for:

- spending funds
- recovering prior payments
- reconstructing recipient private keys

## Package Boundaries

### `@nanomyms/protocol`

Owns:

- `nnym_` types
- v2 encode/decode
- checksum logic
- notification URI validation helpers

Does not own:

- wallet seed handling
- Nostr clients
- Angular services

### `@nanomyms/crypto`

Owns:

- seed normalization
- deterministic NanoNym key derivation
- shared-secret generation
- stealth public/private derivation
- scalar signing helpers

Does not own:

- relay delivery
- storage
- wallet UI state

### `@nanomyms/core`

Owns:

- create NanoNym identities
- prepare outgoing NanoNym payments
- recover incoming stealth payments
- select stealth inputs

Does not own:

- Nostr transport
- Nano node RPC
- local persistence

## NanoNymNault Adapter Boundary

NanoNymNault remains a Nostr-based wallet today, but that behavior lives at the adapter edge:

- wallet/domain code uses `notificationUri`
- the Nostr adapter accepts `nostr:...`
- transport-specific validation and delivery stay outside the extracted packages

This separation is what makes it possible to use `nnym_` addresses from any TypeScript project without embedding NanoNymNault infrastructure.

## Recovery Model

Recovery remains seed-based:

- restore the same seed
- derive the same NanoNym indexes
- recover the same spend/view keypairs
- use the same notification adapter strategy to recover stealth payments

The protocol version does not add a migration branch here because the system is v2-only.

## Testing Requirements

Must hold across wallet code and extracted packages:

- same seed + same index -> same spend/view/notification helper keys
- hex seed and mnemonic inputs produce stable results
- sender stealth derivation and recipient recovery agree
- recovered stealth private key matches the stealth public key/address

## Historical Note

Older notes that discussed NanoNym v1 or dual-version migration are superseded by the current v2-only design.
