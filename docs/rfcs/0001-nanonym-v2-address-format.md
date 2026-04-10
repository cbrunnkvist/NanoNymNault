# RFC 0001: NanoNym v2 Address Format

## Status

Accepted for implementation.

## Summary

NanoNyms v2 embed a generic destination URI for Tier 1 payment notifications, replacing the Nostr-specific public key field from v1. NanoNymNault continues to use Nostr by storing a `nostr:...` URI in the NanoNym address, but the protocol address format itself is transport-agnostic.

Since v1 was a Tech Preview, there is no backward-compatibility requirement for v1 in NanoNymNault or in the `@nanomyms/*` packages.

## Motivation

The v1 NanoNym format embedded a Nostr-specific field into the protocol address, making the standard transport-specific and forcing transport assumptions into domain code.

Goals:

- A transport-agnostic NanoNym format
- Reusable TypeScript packages published as `@nanomyms/*`
- No relay clients or wallet infrastructure in the extracted packages
- A clean protocol contract that any TypeScript project can use

## Decision

NanoNyms are defined only as v2 from this point onward.

- NanoNymNault will only create and consume v2 NanoNyms.
- `@nanomyms/protocol` will only encode and decode v2 NanoNyms.
- `@nanomyms/crypto` and `@nanomyms/core` will only speak in v2 terms.
- v1 is historical context only and is not implemented.

## Address Format

Human-readable encoding:

- Prefix: `nnym_`
- Body: Nano-style base32

A `nnym_` address contains exactly three semantic elements:

- A spend public key
- A view public key
- A Tier 1 notification destination URI

It does not contain funds, balances, transaction history, relay client configuration, or any private key material.

## Binary Layout

```text
+---------+--------------------+----------+------------------+------------------+
| Bytes   | Field              | Size     | Meaning          | Notes            |
+---------+--------------------+----------+------------------+------------------+
| 0       | version            | 1 byte   | protocol version | fixed: 0x02      |
| 1..32   | B_spend            | 32 bytes | spend pubkey     | Ed25519          |
| 33..64  | B_view             | 32 bytes | view pubkey      | Ed25519          |
| 65..66  | notificationUriLen | 2 bytes  | URI length       | uint16 BE        |
| 67..N   | notificationUri    | variable | Tier 1 route     | UTF-8            |
| N+1..N+2| checksum           | 2 bytes  | integrity check  | BLAKE2b-derived  |
+---------+--------------------+----------+------------------+------------------+
```

Logical shape:

```text
nnym_
  -> base32(payload)
       -> [ version | B_spend | B_view | uri_length | notification_uri | checksum ]
```

Example interpretation:

```text
notification_uri = "nostr:npub1..."

This means:
- The NanoNym protocol stores a generic URI.
- NanoNymNault interprets that URI as a Nostr destination.
- The protocol itself does not know how Nostr delivery works.
```

## Notification URI Rules

- The URI is stored as UTF-8 bytes.
- The URI MUST NOT be empty.
- The URI MUST include a scheme component.
- The URI length MUST fit in `uint16`.
- Scheme-specific validation belongs in adapters, not in the protocol core.

Examples:

- `nostr:npub1...`
- `nostr:nprofile1...`
- `https://example.invalid/.well-known/nanonym/alice`

## Protocol Boundary

The protocol layer knows only that a NanoNym contains a notification URI. It does not know how that URI is resolved, how delivery is performed, or which network client is used. That behavior belongs in adapters.

## NanoNymNault Implication

NanoNymNault remains a Nostr-based wallet, but Nostr moves to the adapter edge:

- The protocol package stores `notificationUri`.
- The wallet interprets `nostr:...` URIs.
- The Nostr client remains application infrastructure.

## Package Boundaries

**`@nanomyms/protocol`**

- NanoNym v2 address layout
- Address encode/decode
- Checksum handling
- Notification payload schemas (RFC 0002)
- URI helper utilities

**`@nanomyms/crypto`**

- Deterministic seed normalization
- Deterministic NanoNym key derivation
- Stealth address derivation
- Stealth private key derivation
- Scalar signing helpers
- Pure helpers for building `nostr:` notification URIs

**`@nanomyms/core`**

- Pure use-case APIs: create NanoNym identities, prepare outgoing stealth payments, recover incoming stealth payments, select stealth inputs

## Migration Boundary

This is a clean cut, not a compatibility migration. No v1 decode path, no dual-version branching, no package API that exposes both old and new NanoNym shapes.

## Relationship to Other RFCs

RFC 0001 defines the extension point. The notification URI slot enables transport profiles without changing the address format:

- RFC 0002 defines the payload schema carried by all profiles.
- RFC 0003 defines delivery when the URI is `nostr:npub1...`.
- RFC 0004 defines verification when the NanoNym is used in an HTTP 402 flow.

## Open Questions

- Whether wallet UX should impose a stricter URI length cap than `uint16`.
- Whether the protocol package should expose optional URI scheme validators or leave all scheme validation to adapters.
