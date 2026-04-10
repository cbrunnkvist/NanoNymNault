# RFC 0002: NanoNym Payment Event Schema

## Status

Draft.

## Summary

This RFC defines the **payment event schema**: a transport-agnostic, encryption-agnostic JSON structure representing a NanoNym stealth payment notification. It is the canonical data format shared by all transport profiles.

## Design Rationale

The payment event schema defines the logical content of a payment notification. It is transport-agnostic and encryption-agnostic. Transport profiles (Nostr, x402, others) define how this schema is delivered - encrypted or plaintext, pushed or pulled, wrapped or naked. The schema itself is invariant across all profiles.

| Concern | Varies by profile |
|---|---|
| Transport mechanism | Yes (Nostr relay, HTTPS, WebSocket, etc.) |
| Encryption layer | Yes (NIP-44, TLS, none, etc.) |
| Direction of flow | Yes (push notification vs. client proof) |
| Privacy model | Yes (hidden from observers vs. voluntarily disclosed) |
| Payload schema | **No - this RFC** |

## Schema Definition

A payment event is a JSON object.

**Required fields:**

| Field | Type | Description |
|---|---|---|
| version | integer | Schema version. MUST be `2`. |
| protocol | string | Protocol identifier. MUST be `"nanonym"`. |
| R | string | Hex-encoded Ed25519 ephemeral public key (64 hex characters). Used as the stealth derivation input. |
| tx_hash | string | Hex-encoded hash of the on-chain send block (64 hex characters). |

**Optional fields:**

| Field | Type | Description |
|---|---|---|
| amount_raw | string | Decimal string of the payment amount in Nano's smallest unit (raw). No leading zeros except for the value `"0"`. |
| memo | string | Freeform UTF-8 text. |

## Example

```json
{
  "version": 2,
  "protocol": "nanonym",
  "R": "ab3f1e7c9d...64 hex chars...fa08",
  "tx_hash": "9c21de5b3a...64 hex chars...17f0",
  "amount_raw": "1000000000000000000000000000000"
}
```

## Validation Rules

1. `version` MUST be the integer `2`.
2. `protocol` MUST be the string `"nanonym"`.
3. `R` MUST be a 64-character lowercase hexadecimal string encoding a valid Ed25519 compressed point (32 bytes).
4. `tx_hash` MUST be a 64-character lowercase hexadecimal string.
5. `amount_raw`, if present, MUST be a decimal string with no leading zeros (except `"0"` itself).
6. `memo`, if present, MUST be a valid UTF-8 string.
7. Implementations MUST reject payloads missing any required field.
8. Implementations MUST ignore unrecognized fields (forward compatibility).

## Profile Extensibility

Transport profiles (RFC 0003, RFC 0004, future RFCs) extend this schema for their specific trust models. The following rule governs all profiles:

> A valid profile payload MUST be a valid base schema payload. Profiles MAY add fields. Profiles MUST NOT remove or redefine base schema fields.

As a concrete example, the x402 profile (RFC 0004) adds the ephemeral scalar $r$ alongside $R$. This field is meaningful only when the verifier lacks the view private key. In the Nostr notification profile (RFC 0003), including $r$ would be a privacy leak. The base schema therefore carries $R$ only; profiles add exactly the fields their trust model requires.

## Versioning

The schema version is `2`. This matches the NanoNym v2 address version defined in RFC 0001. The two version numbers are **independently governed** - the payload version happens to match the address version but is not required to track it. The value `2` is retained because it is already emitted by the existing production implementation; changing it to `1` would be a breaking change for no functional gain.

## The Role of $R$

The field $R$ is an Ed25519 ephemeral public key corresponding to a per-payment ephemeral scalar $r$, such that $R = r \cdot G$ where $G$ is the Ed25519 basepoint. The scalar $r$ is generated fresh for each payment and serves as the stealth derivation input. The full stealth derivation procedure - how $r$ is generated, how the stealth address $SA$ is computed, and how the recipient recovers the corresponding private key - is specified in RFC 0005.

This schema carries $R$ (the public point), not $r$ (the scalar). The scalar is secret to the payer and is disclosed only in profiles where the verifier lacks the view private key (see RFC 0004).

## Relationship to Other RFCs

- **RFC 0001** defines the address format that contains the public keys ($B_{\text{spend}}$, $B_{\text{view}}$) and the notification URI.
- **RFC 0002** (this document) defines the payload schema that references those keys via $R$ and records the on-chain transaction.
- **RFC 0003** defines how this payload is delivered via Nostr.
- **RFC 0004** defines how this payload is used as a proof of payment in HTTP 402 flows.
- **RFC 0005** (deferred) specifies the stealth derivation math.

## Package Boundary

Schema validation (structure, field types, hex format, version check) belongs in `@nanomyms/protocol`. Stealth-related validation (verifying $R$ is on-curve, deriving stealth addresses) belongs in `@nanomyms/crypto`.

## Open Questions

- Whether to define a maximum length for `memo`.
- Whether `amount_raw` should be required in profiles where the server must verify payment amount (currently deferred to individual profile RFCs).
