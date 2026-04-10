# RFC 0004: x402.NanoSession Payment Verification Profile

## Status

Draft.

## Summary

This RFC defines how the payment event schema (RFC 0002) is used in an HTTP 402 machine-to-machine payment flow. The NanoNym stealth address derivation is repurposed as a **commitment scheme**: the client proves it made a specific payment by revealing the ephemeral scalar $r$, allowing the server to verify stealth address derivation without holding the view private key.

## Scope

This RFC covers:

- The HTTP 402 request/response flow for NanoNym payments.
- The profile-specific payload extension (the $r$ field).
- Server-side verification using public keys and the client-provided $r$.
- Security properties of the proof mechanism.

This RFC does NOT cover:

- The payment event schema itself (see RFC 0002).
- The stealth derivation math (see RFC 0005).
- Nostr notification delivery (see RFC 0003).
- General HTTP 402 protocol semantics beyond the NanoNym-specific binding.

## Conceptual Model

In the Nostr notification profile (RFC 0003), the stealth mechanism provides **privacy**: the sender notifies the recipient of a payment that only the recipient can identify. In this profile, the stealth mechanism provides **commitment**: the client proves to a resource server that it made an irrevocable payment to a stealth address derived from the server's NanoNym.

The proof is non-interactive and signature-less. The binding arises from the mathematical relationship between $r$, $R$, the NanoNym's public keys, the derived stealth address, and the on-chain transaction.

## Protocol Flow

```text
Client                                  Resource Server
  |                                           |
  |  1. GET /resource                         |
  |------------------------------------------>|
  |                                           |
  |  2. 402 Payment Required                  |
  |     { nanonym, amount_raw }               |
  |<------------------------------------------|
  |                                           |
  |  3. Derive stealth address from nnym,     |
  |     send Nano payment on-chain            |
  |                                           |
  |  4. GET /resource                         |
  |     X-Payment: <proof>                    |
  |------------------------------------------>|
  |                                           |
  |  5. Verify proof, return resource         |
  |<------------------------------------------|
```

**Step 1.** The client requests a resource.

**Step 2.** The server responds with HTTP 402 and a JSON body containing the server's NanoNym and payment requirements:

```json
{
  "nanonym": "nnym_abc123...",
  "amount_raw": "1000000000000000000000000000000"
}
```

**Step 3.** The client:

- Parses the NanoNym to extract $B_{\text{spend}}$ and $B_{\text{view}}$.
- Generates a fresh ephemeral scalar $r$ and computes $R = r \cdot G$.
- Derives the stealth address $SA$ per RFC 0005.
- Sends a Nano payment of the required amount to $SA$.
- Waits for on-chain confirmation.

**Step 4.** The client retries the request with an `X-Payment` header containing a base64url-encoded JSON payment proof:

```json
{
  "version": 2,
  "protocol": "nanonym",
  "R": "ab3f...64 hex chars...",
  "tx_hash": "9c21...64 hex chars...",
  "amount_raw": "1000000000000000000000000000000",
  "r": "7a1f...64 hex chars..."
}
```

**Step 5.** The server verifies the proof and, if valid, returns the requested resource.

## Payload Extension

This profile extends the RFC 0002 base schema with one field:

| Field | Type | Description |
|---|---|---|
| r | string | Hex-encoded Ed25519 ephemeral scalar (64 hex characters). The scalar corresponding to $R$ such that $R = r \cdot G$. |

The `r` field is REQUIRED in this profile. The `amount_raw` field, while optional in the base schema, is effectively REQUIRED in this profile because the server must verify the payment amount.

Per the profile extensibility rule (RFC 0002), this payload is a strict superset of the base schema:

```text
Base schema (RFC 0002)        x402 profile (this RFC)
---------------------         --------------------------
version: 2                    version: 2
protocol: "nanonym"           protocol: "nanonym"
R: "ab3f..."                  R: "ab3f..."
tx_hash: "9c21..."            tx_hash: "9c21..."
amount_raw: "1000..."         amount_raw: "1000..."
                              r: "7a1f..."   <- only addition
```

## Server Verification

The server holds only the public components of its NanoNym: $B_{\text{spend}}$ and $B_{\text{view}}$. It does not need the view private key $b_{\text{view}}$ for verification because the client provides $r$ directly.

Verification proceeds in two stages:

**Stage 1: Consistency check (cheap, no network)**

Verify that $R = r \cdot G$.

This is a single scalar-basepoint multiplication. It rejects malformed or tampered payloads before any on-chain lookup.

**Stage 2: Derivation and on-chain verification**

1. Compute the stealth address: $SA = B_{\text{spend}} + H(r \cdot B_{\text{view}}) \cdot G$, where $H$ is the stealth derivation hash function defined in RFC 0005.
2. Convert $SA$ to a Nano account address.
3. Look up `tx_hash` on-chain and verify:
   - The block exists and is confirmed.
   - The destination is $SA$.
   - The amount is at least `amount_raw`.

If all checks pass, the proof is valid.

## Security Properties

**Non-transferability.** The proof binds $r$ to a specific stealth address derived from the server's NanoNym. An attacker who observes the proof cannot reuse it for a different server (different NanoNym, different $B_{\text{spend}}$/$B_{\text{view}}$) or claim a different transaction.

**Client cannot cheat.** A client that pays to an arbitrary address (e.g., one it controls) cannot produce an $r$ that causes the server's verification to derive that address as $SA$. The stealth derivation is a one-way function of $r$ and the server's public keys. Fabricating a valid $r$ for an arbitrary target address requires inverting the derivation hash, which is computationally infeasible.

**Server cannot scan.** The server receives $r$ values from individual clients but does not hold $b_{\text{view}}$. It cannot scan for payments it was not explicitly told about. Each $r_i$ reveals only the shared secret for that specific payment.

**Accumulation resistance.** Collecting multiple $r_i$ values does not compromise $b_{\text{view}}$ or $b_{\text{spend}}$. Recovering a private key from public points and individual shared secrets requires solving discrete logarithms, which is computationally infeasible on Ed25519.

**Minimal disclosure.** Compared to the alternative of sharing $b_{\text{view}}$ with the server:

| Property | Sharing $b_{\text{view}}$ | Sharing $r$ per payment |
|---|---|---|
| Server can verify specific payment | Yes | Yes |
| Server can scan for all payments | Yes | No |
| Risk to spend key | None | None |
| Risk to future payment privacy | Yes (universal view access) | None ($r$ is per-payment) |
| Disclosure scope | Permanent, all payments | Ephemeral, single payment |

Sharing $r$ provides the minimum necessary disclosure for verification.

## Privacy Properties

- The client voluntarily discloses $r$ and `tx_hash` to the server. This is inherent to the proof model - the client is proving payment, not hiding it.
- The server learns the stealth address for this specific payment only.
- Third parties observing the HTTPS connection (but not the TLS plaintext) learn nothing.
- The proof does not reveal the NanoNym owner's private keys or enable identification of other payments.

## Relationship to Other RFCs

- **RFC 0001** defines the NanoNym address the server publishes in its 402 response.
- **RFC 0002** defines the base payload schema this profile extends.
- **RFC 0003** is the Nostr notification profile - a separate transport for the same base schema, with a different trust model (recipient has $b_{\text{view}}$; $r$ is never disclosed).
- **RFC 0005** (deferred) defines the stealth derivation math used in verification.

## Open Questions

- Whether to define additional HTTP response codes or headers for verification failure modes (e.g., `tx_hash` not found, amount insufficient, $R \neq r \cdot G$).
- Whether the 402 response body should include additional fields (e.g., a payment memo, expiry time, or resource identifier).
- Whether to support alternative HTTP bindings (e.g., payment proof in a POST body rather than an `X-Payment` header) for payloads that exceed practical header size limits.
- Whether a session or token mechanism should follow successful verification, or whether each request requires a fresh proof.
