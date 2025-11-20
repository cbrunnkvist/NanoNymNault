# NanoNyms

**Privacy-preserving, reusable, payments codes for [Nano](https://www.nano.org/) using stealth addresses and off-chain coordination**


---

## Elevator Pitch

NanoNymNault is a fork of **[Nault](https://github.com/Nault/Nault)** (the popular web-based Nano wallet) integrating a lightweight **Nostr client** that enables **private, unlinkable payments** over the regular Nano blockchain, using a new type of reusable pseudonym called a **NanoNym** (address prefix: `nnym_`).

### What does it do for users?

**For Recipients (merchants, streamers, donation pages):**
1. Generate one or more **NanoNyms** (displayed as `nnym_abc123...xyz` addresses)
2. Share publicly (on website, social media, stream overlay, printed invoices, etc.)
3. Receive unlimited number of payments through the NanoNym, all that:
   - Go to different blockchain addresses (unlinkable)
   - Don't reveal your balance
   - Don't show your payment history
4. Your wallet automatically detects incoming payments and shows a unified balance

**For Senders:**
1. Paste recipient's NanoNym (`nnym_` address) into the send field (or scan a QR code)
2. Enter amount and send (just like a normal Nano transaction)
3. Behind the scenes:
   - Wallet derives a unique stealth address for this payment
   - Sends XNO on Nano blockchain (looks like any other transaction)
   - Sends encrypted notification via Nostr (free, instant, private)
4. Recipient automatically receives and can spend funds

It's a true _win-win_ for both senders and receivers: both gain significantly enhanced privacy protection, without any involvement of third-party payment processors or fees.

---

## Key Benefits

✅ **Privacy:** No one can link multiple payments to the same recipient <br/>
✅ **Simplicity:** Recipients share ONE NanoNym (not a new address for each payment) <br/>
✅ **Multiple NanoNyms:** Generate as many as needed from a single seed <br/>
✅ **Free notifications:** No blockchain bloat or notification transaction costs <br/>
✅ **Compatibility:** Falls back to regular `nano_` addresses for non-compliant wallets <br/>
✅ **Web-based:** Works in browser, no installation needed (just like Nault) <br/>

---

## What is a NanoNym?

**NanoNym** = **Nano** + **onym** (Ancient Greek ὄνυμα "name")

A NanoNym is a **reusable pseudonym** for receiving payments privately. Think of it like:
- A pen name for authors (hides real identity)
- A stage name for performers (public-facing but not your real name)
- A business name (represents you but isn't personally identifiable)

**Technical details:**
- Encoded as `nnym_` addresses (~160 characters)
- Contains three public keys (spend, view, Nostr notification)
- All NanoNyms are structurally identical and infinitely reusable
- Multiple NanoNyms can be derived from a single seed

---

## NanoNym Use Cases

### Use Case 1: Long-Term Public NanoNym
```
Generate: "General Donations"
Print on: Website footer, business card, stream overlay
Use for: Years of recurring donations
```

### Use Case 2: Per-Transaction NanoNym
```
Generate: "Customer #1234 - Invoice #5678"
Display: On checkout screen (ephemeral display)
Use for: Single purchase
Archive: After payment received
```

### Use Case 3: Per-Department NanoNyms
```
Generate: "Sales Q1 2025"
Generate: "Consulting Services"
Generate: "Product Returns"
Use for: Accounting categorization and revenue tracking
```

**All NanoNyms work identically** - the difference is only in how you choose to use them!

---

## How It Works (High Level)

```
Nault Wallet (existing web wallet)
  + Nostr client (lightweight messaging, runs in browser)
  + CamoNano cryptography (proven stealth address math)
  = NanoNymNault (private payment wallet)
```

**Users don't need to:**
- Run a Nostr relay
- Understand Nostr
- Download anything extra
- Change how they use Nano

**It just works** — privacy built-in, seamlessly.

---

## Comparison to Standard Nano

| Feature | Standard Nano Address | NanoNym (`nnym_`) |
|---------|----------------------|-------------------|
| **Address reuse** | Publicly links all transactions | Each payment goes to unique address |
| **Balance privacy** | Anyone can see your balance | Balance hidden across multiple addresses |
| **Sender anonymity** | Sender account visible | Sender can remain anonymous |
| **Multiple addresses from one seed** | Limited by wallet | Unlimited NanoNyms |
| **Notifications** | None needed | Off-chain via Nostr (automatic) |
| **Use case** | General payments | Privacy-conscious users, merchants, donations |

---

## Technical Foundation

NanoNymNault combines three proven technologies:

1. **CamoNano Protocol:** Battle-tested cryptography for stealth addresses (Monero-inspired, adapted for Nano)
2. **Nostr (NIP-17):** Decentralized, encrypted messaging for payment notifications
3. **Nault Wallet:** Mature, trusted web-based Nano wallet

**Key Innovation:** By moving notifications off-chain (via Nostr), we solve CamoNano's timing correlation vulnerability while eliminating notification transaction costs.

---

## Key Management: Simple & Secure

### Your Nano Seed is Your Master Key

NanoNymNault is designed so you only need to manage one secret: **your 24-word Nano seed phrase**.

From this single seed, the wallet securely generates all the necessary components for both your Nano funds and your private Nostr notifications.

```
Your Nano Seed (24 words)
    ↓
    ├─→ All your Nano accounts & funds
    └─→ All your private Nostr notifications
```

Think of your seed as a master key. It can create a perfectly matched, but separate, set of keys for different systems (one for Nano, one for Nostr). This means you get the convenience of a single backup without compromising on security.

**Bottom line: Back up your one Nano seed, and you can always recover everything.**

### For Advanced Nostr Users (Future Feature)

We plan to support users who want to connect an existing Nostr identity (an `nsec` key) to the wallet.

Because Nano and Nostr use different cryptographic systems, the wallet can't guess your existing Nostr key from your Nano seed. In this specific, advanced scenario, you would need to provide both your Nano seed and your Nostr key. For the vast majority of users, this won't be necessary.

### Current Status

**Phase 1 (Implemented):** Simple, one-seed-only model.
**Phase 2 (Planned):** Optional support for linking an existing Nostr key.

---

## Project Status

🔨 **In Development** - Planning phase complete, implementation starting

### Documentation

- **[CLAUDE.md](CLAUDE.md)** - Original protocol specification (revised after BIP analysis)
- **[ANALYSIS-CAMONANO-ALTERNATIVES.md](ANALYSIS-CAMONANO-ALTERNATIVES.md)** - Deep dive into CamoNano, BIP protocols, and off-chain notification alternatives

---



---

## Current Status & Next Steps

**✅ What's Working:**
- Sending TO NanoNyms (full flow: generate stealth address → send XNO → send Nostr notification)
- Receiving payments (notifications decrypt, stealth addresses derived, balances displayed)
- NanoNym management (generate, label, archive/reactivate, view details)
- Multi-relay Nostr redundancy (3-5 relays simultaneously)

**❌ Current Blocker: Spending FROM Stealth Accounts**

Location: `src/app/services/nanonym-manager.service.ts:343-348`

```typescript
// TODO: Add stealth account to WalletService
// This will require modifying WalletService to support imported accounts
```

**What needs to be implemented:**
1. **WalletService integration** - Import stealth accounts as spendable accounts
2. **Account selection algorithm** - Choose which stealth accounts to spend from (minimize linkage)
3. **Privacy warning UI** - Warn users when multiple accounts will be linked on-chain
4. **Multi-account send flow** - Coordinate sending from N stealth accounts to 1 destination

**See:** CLAUDE.md Section 8 (Spending from Stealth Accounts) for complete specification.

---

## Security & Privacy

### Privacy Properties

✅ **Against blockchain observers:** Cannot link payments to receiver
✅ **Against Nostr relays:** Cannot read notification contents (NIP-17 encryption)
✅ **Against network observers:** Cannot correlate Nostr activity with Nano transactions
✅ **Against timing analysis:** NIP-17 uses randomized timestamps

### Security Considerations

- All cryptography uses well-audited libraries
- Nostr NIP-17 provides authenticated encryption (AEAD)
- Multi-relay redundancy prevents single point of failure
- View keys can be separated from spend keys (watch-only wallets)
- Single seed backs up unlimited NanoNyms

**Security Audit:** Recommended before mainnet launch (if budget permits)

---

## Getting Started (Coming Soon)

### For Users
```bash
# Installation instructions will be provided when ready
# For now, the project is in active development
```

### For Developers

#### Prerequisites
- **Node.js v16.20.2** (via nvm)
- **Python 3.11** (for native module compilation)

#### Building the Reference Nault Wallet

The project is forked from Nault. To build and run the stock Nault wallet locally:

```bash
# Clone the repository
git clone https://github.com/yourusername/NanoNymNault.git
cd NanoNymNault/references/Nault

# Switch to Node v16 (required for native module compatibility)
source ~/.nvm/nvm.sh
nvm use 16

# Install dependencies
# IMPORTANT: Use these exact flags for Apple Silicon compatibility
npm_config_arch=x64 \
PYTHON=/opt/homebrew/opt/python@3.11/bin/python3.11 \
npm ci

# Run development server
npm start
# Access at http://localhost:4200/
```

**Why these specific flags?**
- `npm_config_arch=x64` - Electron 9.4.4 doesn't have ARM64 builds, use Rosetta emulation
- `PYTHON=/opt/homebrew/opt/python@3.11/bin/python3.11` - Python 3.14 removed `distutils` which node-gyp requires
- `npm ci` - Uses exact versions from package-lock.json (not `npm install`)
- `nvm use 16` - Node v16 required for native module (usb, node-hid) C++ compilation

**Troubleshooting:**
- If port 4200 is in use: `lsof -ti:4200 | xargs kill -9`
- If Python error: Install Python 3.11 via `brew install python@3.11`
- If Node version error: Install via `nvm install 16`

#### Testing

**For test running instructions, test strategy, and debugging:** See **[TESTING.md](TESTING.md)**

---

## Contributing

This project is in early development. Contributions, feedback, and testing are welcome!

**Areas where help is needed:**
- Cryptography review (CamoNano implementation)
- Nostr integration testing
- UI/UX design for privacy features
- Documentation and tutorials
- Security auditing

---

## Acknowledgments

**Standing on the shoulders of giants:**

- **Nault Team** - Excellent web-based Nano wallet foundation
- **CamoNano Project** - Pioneering stealth addresses for Nano
  - [nanopyrs](https://github.com/CamoNano/nanopyrs) - Reference implementation
  - [camonanowallet](https://github.com/expiredhotdog/camonanowallet) - First full wallet
- **Monero Community** - Original stealth address inspiration
- **Nostr Protocol** - Decentralized messaging infrastructure
- **Bitcoin BIPs** - Protocol design patterns (BIP-352, BIP-77, BIP-47)

---

## License

See the [LICENSE](LICENSE) document for details.

---

## Contact & Community

- **GitHub Issues:** [Report bugs or suggest features](https://github.com/yourusername/NanoNymNault/issues)
- **Discord:** [Coming soon]
- **Reddit:** r/nanocurrency

---

## Disclaimer

⚠️ **This software is experimental and under active development.**

- Not yet audited by security professionals
- Use at your own risk
- Start with small amounts for testing
- Privacy guarantees depend on proper usage (see documentation)

---

## FAQ

**Q: Is this a new cryptocurrency?**
A: No! NanoNymNault uses the existing Nano (XNO) cryptocurrency. It's just a wallet with enhanced privacy features.

**Q: What's the difference between a NanoNym and a regular Nano address?**
A: A NanoNym is a reusable pseudonym that generates unique stealth addresses for each payment. Regular `nano_` addresses publicly link all transactions.

**Q: Can I generate multiple NanoNyms?**
A: Yes! You can generate unlimited NanoNyms from a single seed. Use them for different purposes (donations, sales, per-customer, etc.).

**Q: Are NanoNyms "ephemeral" or "permanent"?**
A: All NanoNyms are structurally identical and reusable. You decide how to use them - print one for long-term use, or generate unique ones per transaction.

**Q: Do I need to run a Nostr relay?**
A: No. The wallet connects to existing public Nostr relays (1000+ available). You can optionally run your own for extra privacy.

**Q: Will regular Nano wallets be able to send to my NanoNym?**
A: No, only NanoNymNault-compatible wallets can send to NanoNyms (`nnym_` addresses). For compatibility, your wallet will also display a regular `nano_` fallback address (though this won't provide privacy).

**Q: What happens if Nostr notifications fail?**
A: The wallet uses 3-5 relays simultaneously for redundancy. Even if some relays fail, notifications should get through. Senders can also manually resend notifications if needed.

**Q: How is this different from CamoNano?**
A: NanoNymNault uses CamoNano's cryptography but replaces on-chain notifications (which cost XNO 0.00049 and leak timing info) with free, encrypted off-chain Nostr notifications.

**Q: Can I use this for everyday payments?**
A: The primary use case is for recipients who want to share a public address (merchants, donations, streamers) without revealing their payment history. For everyday peer-to-peer payments, standard Nano addresses are simpler.

**Q: Is this more private than Monero?**
A: No. Monero has additional privacy features (ring signatures, confidential amounts) that hide sender, receiver, AND amounts. NanoNymNault only hides receiver unlinkability and optionally sender identity. It's a practical privacy improvement for Nano, not full anonymity.

**Q: How do I back up my NanoNyms?**
A: Your seed phrase backs up ALL NanoNyms automatically. During recovery, the wallet will re-derive all your NanoNyms and scan for payments.

---

## Developer Preview

**Try the latest development version:** https://cbrunnkvist.github.io/NanoNymNault/

This developer preview is automatically deployed from the `main` branch. It reflects the latest implemented features and may contain experimental functionality. Use with caution and test with small amounts only.

---

**Built with 🔐 for the Nano community**
