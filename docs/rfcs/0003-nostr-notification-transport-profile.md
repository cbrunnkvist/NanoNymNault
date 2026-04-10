# RFC 0003: Nostr Notification Transport Profile

## Status

Draft.

## Summary

This RFC defines how the payment event schema (RFC 0002) is delivered via Nostr when the NanoNym's notification URI is a `nostr:npub1...` or `nostr:nprofile1...` URI. It specifies the transport mechanism (NIP-59 gift-wrap with NIP-44 encryption), the Nostr-specific key derivation, and the blind scanning model.

## Scope

This RFC covers:

- Delivery of RFC 0002 payloads via Nostr gift-wrapped events.
- The Nostr-specific notification key derived from the NanoNym owner's seed.
- The blind scanning model for incoming payment discovery.

This RFC does NOT cover:

- The payment event schema itself (see RFC 0002).
- The stealth address derivation math (see RFC 0005).
- Transport-agnostic encryption envelopes.
- Any non-Nostr transport mechanism.

## Prerequisites

- The recipient has published a NanoNym (RFC 0001) whose notification URI uses the `nostr:` scheme.
- The sender has constructed a valid payment event (RFC 0002) after completing a stealth payment.

## Transport Mechanism

### Notification Key Derivation

The NanoNym owner derives a **secp256k1** keypair from their Nano seed using key_type `2`. This keypair is used exclusively for Nostr event signing and gift-wrap decryption. It is **not** an Ed25519 key and is **not** used for stealth address math.

The corresponding Nostr public key is encoded as an `npub` and embedded in the NanoNym's notification URI:

```text
notification_uri = "nostr:npub1<bech32-encoded secp256k1 pubkey>"
```

This keypair exists in a separate keyspace from the spend/view Ed25519 keys. The three keyspaces are:

| Keyspace | Curve | Key type | Purpose |
|---|---|---|---|
| Spend / View | Ed25519 | 0, 1 | Stealth address derivation |
| Notification | secp256k1 | 2 | Nostr NIP-59 transport |
| Per-payment ephemeral | Ed25519 | random | Stealth input $R$ |

### Event Wrapping

The sender delivers the payment event using **NIP-59** (Gift Wrap), which provides sender anonymity and metadata protection. The inner payload is encrypted using **NIP-44**.

The wrapping procedure, by reference:

1. The sender constructs the RFC 0002 JSON payload.
2. The payload is placed as the content of a Nostr event.
3. The event is sealed and gift-wrapped per NIP-59 to the recipient's `npub`.
4. The wrapped event is published to one or more Nostr relays.

This RFC does not respecify NIP-59 or NIP-44. Implementations MUST conform to those NIPs as defined by the Nostr protocol.

### Payload Content

The content of the inner (unwrapped, decrypted) Nostr event is a JSON string conforming to the RFC 0002 payment event schema. No additional fields are added by this profile. Specifically, the ephemeral scalar $r$ MUST NOT be included - the recipient possesses $b_{\text{view}}$ and can derive the shared secret from $R$ alone.

## Recipient Scanning (Blind Scanning Model)

The recipient discovers incoming stealth payments by scanning Nostr relays for gift-wrapped events addressed to their notification `npub`:

1. Connect to relays and fetch events addressed to the notification public key.
2. Unwrap each event per NIP-59 and decrypt per NIP-44.
3. Parse the inner content as an RFC 0002 payment event.
4. Extract $R$ from the payload.
5. Compute the shared secret using $b_{\text{view}}$ and $R$ per RFC 0005.
6. Derive the expected stealth address $SA$.
7. Verify that `tx_hash` corresponds to an on-chain payment to $SA$.
8. If verified, recover the stealth private key using $b_{\text{spend}}$ and the shared secret per RFC 0005.

This model is "blind" in the following sense:

- Relays see gift-wrapped events to an `npub` but cannot read the content or link events to Nano addresses.
- Third-party observers cannot associate the `npub` with any on-chain Nano activity.
- The recipient processes all events to their `npub` but only those containing valid stealth derivations correspond to actual payments.

## Relay Availability

This model inherits Nostr's relay availability assumptions. If the relays used by the sender are not monitored by the recipient, the notification may not be discovered. This RFC acknowledges this limitation without attempting to solve it. Implementations SHOULD support configuring multiple relays and MAY implement retry or redundancy strategies at the application layer.

## Privacy Properties

- The sender's identity is hidden from relays and observers by NIP-59.
- The payment amount, stealth address, and transaction hash are hidden inside NIP-44 encryption.
- The notification `npub` (secp256k1) is unlinkable to the spend/view keys (Ed25519) without knowledge of the seed.
- The ephemeral scalar $r$ is never transmitted - $R$ (the public point) is sufficient for the recipient.

## Relationship to Other RFCs

- **RFC 0001** provides the `nostr:npub1...` URI that this profile resolves.
- **RFC 0002** defines the payload this profile delivers.
- **RFC 0005** (deferred) defines the stealth derivation math used in scanning.

## Package Boundary

Nostr event construction, NIP-59 wrapping, NIP-44 encryption, and relay communication belong in `@nanomyms/nostr-adapter`. This package depends on `@nanomyms/protocol` for schema validation but contains no stealth derivation logic.

## Open Questions

- Whether to specify a recommended minimum number of relays for redundancy.
- Whether to define a Nostr event `kind` specifically for NanoNym payment notifications or rely on the generic NIP-59 gift-wrap kind.
