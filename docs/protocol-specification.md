# NanoNym Protocol Specification

This document defines **what** the current NanoNym protocol does and how the wallet-level components interact. For the exact address layout, see [rfcs/0001-nanonym-v2-address-format.md](rfcs/0001-nanonym-v2-address-format.md).

## 1. Terminology

- **NanoNym**: A reusable payment code encoded as `nnym_...`
- **Tier 1 notification**: The off-chain notification route stored as a URI inside the NanoNym
- **Stealth account**: A one-time `nano_` address derived for a specific payment
- **Aggregated NanoNym account**: The wallet view that sums all stealth accounts belonging to one NanoNym

## 2. NanoNym Address Format

NanoNyms are **v2-only**.

A `nnym_` contains exactly three semantic payloads:

- spend public key
- view public key
- notification URI

The address does not contain:

- balances
- transaction history
- relay client configuration
- private keys

At the protocol boundary, the notification route is just a URI. NanoNymNault currently uses `nostr:...`, but that is an adapter choice rather than a protocol requirement.

## 3. Send Workflow

When a sender inputs a `nnym_` address:

1. Decode the NanoNym and extract `B_spend`, `B_view`, and `notificationUri`.
2. Generate an ephemeral keypair for this payment.
3. Derive a shared secret between the ephemeral private key and the recipient view public key.
4. Derive a one-time stealth destination from that shared secret plus the recipient spend public key.
5. Send the Nano payment on-chain to the stealth destination.
6. Build a Tier 1 notification payload containing the ephemeral public key and transaction metadata.
7. Hand the notification payload plus `notificationUri` to an adapter.

In NanoNymNault today:

- the adapter expects `nostr:...`
- the payload is gift-wrapped and published to Nostr relays

## 4. Receive Workflow

For each active NanoNym:

1. Resolve the NanoNym's `notificationUri` through the wallet's configured Tier 1 adapter.
2. Receive and decrypt a notification payload intended for that NanoNym.
3. Extract the sender ephemeral public key and transaction metadata.
4. Recompute the expected stealth destination using the NanoNym's private view key and public spend key.
5. Derive the stealth private key needed to spend from that destination.
6. Verify the payment against the chain and add the resulting stealth account to wallet state.

Offline or cold recovery works by replaying the same derivation rules from seed and scanning through the configured notification mechanism plus chain state.

## 5. Stealth Account Selection

When spending from a NanoNym, the wallet selects funded stealth accounts to satisfy the target amount.

Goals:

- prefer a single stealth account when possible
- otherwise use a bounded greedy selection
- randomize send order to reduce deterministic patterns

The extracted `@nanomyms/core` package exposes a pure `selectStealthInputs` helper for this.

## 6. Wallet Model

From the wallet UI perspective, each NanoNym behaves like an aggregated account:

- one label
- one displayed balance
- one payment count
- many underlying stealth accounts

Archiving a NanoNym stops active monitoring in the wallet, but does not affect recoverability from seed.

## 7. Adapter Boundary

The protocol layer knows:

- how to encode and decode `nnym_`
- how to derive stealth destinations and recovery material

The protocol layer does not know:

- how `notificationUri` is delivered
- how a Nostr relay pool works
- how Nano node RPC is performed
- how wallet state is stored

Those concerns belong to application adapters and infrastructure.

## 8. Current NanoNymNault Choice

NanoNymNault currently uses:

- `@nanomyms/protocol` for address semantics
- `@nanomyms/crypto` for deterministic derivation and stealth math
- `@nanomyms/core` for pure use-case flows
- a Nostr adapter for Tier 1 notification delivery

This is intentional. The protocol is generic; the wallet is opinionated.
