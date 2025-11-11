# NanoNymNault

**Privacy-preserving payments for Nano using stealth addresses and off-chain coordination**

---

## Elevator Pitch

NanoNymNault is a fork of **Nault** (the popular web-based Nano wallet) with an integrated lightweight **Nostr client** that enables **private, unlinkable payments** using a new type of reusable pseudonym called a **NanoNym** (address format: `nnym_`).

### What does it do for users?

**For Recipients (merchants, streamers, donation pages):**
1. Generate one or more **NanoNyms** (displayed as `nnym_abc123...xyz` addresses)
2. Share publicly (on website, social media, stream overlay, printed invoices, etc.)
3. Receive unlimited payments that:
   - All go to different blockchain addresses (unlinkable)
   - Don't reveal your balance
   - Don't show your payment history
4. Your wallet automatically detects incoming payments and shows a unified balance

**For Senders:**
1. Paste recipient's NanoNym (`nnym_` address) into the send field
2. Enter amount and send (just like a normal Nano transaction)
3. Behind the scenes:
   - Wallet derives a unique stealth address for this payment
   - Sends XNO on Nano blockchain (looks like any other transaction)
   - Sends encrypted notification via Nostr (free, instant, private)
4. Recipient automatically receives and can spend funds

---

## Key Benefits

✅ **Privacy:** No one can link multiple payments to the same recipient  
✅ **Simplicity:** Recipients share ONE NanoNym (not a new address for each payment)  
✅ **Multiple NanoNyms:** Generate as many as needed from a single seed  
✅ **Free notifications:** No blockchain bloat or notification transaction costs  
✅ **Compatibility:** Falls back to regular `nano_` addresses for non-compliant wallets  
✅ **Web-based:** Works in browser, no installation needed (just like Nault)  

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

## Project Status

🔨 **In Development** - Planning phase complete, implementation starting

### Documentation

- **[CLAUDE.md](CLAUDE.md)** - Original protocol specification (revised after BIP analysis)
- **[ANALYSIS-CAMONANO-ALTERNATIVES.md](ANALYSIS-CAMONANO-ALTERNATIVES.md)** - Deep dive into CamoNano, BIP protocols, and off-chain notification alternatives

---

## Development Roadmap

### Phase 1: Core Cryptography (Weeks 1-2)
- Implement CamoNano key derivation with multi-account support
- `nnym_` address encoding/decoding
- Stealth address generation
- Unit tests for all cryptographic operations

### Phase 2: Nostr Integration (Weeks 3-4)
- Integrate Nostr client library (nostr-tools)
- Implement NIP-17 gift-wrapped encryption
- Relay connection and notification handling
- Multi-relay redundancy

### Phase 3: Wallet UI - Send (Week 5)
- Detect and parse `nnym_` addresses
- Send flow with Nostr notification
- Multi-relay status display
- Error handling and retry logic

### Phase 4: Wallet UI - Receive (Weeks 6-7)
- Generate multiple NanoNyms from seed
- Background Nostr monitoring
- Unified balance display across masked accounts
- Transaction history aggregation
- Per-NanoNym transaction views

### Phase 5-7: Advanced Features, Testing, Documentation (Weeks 8-14)
- NanoNym account management (labels, archive/active status)
- Coin selection and account consolidation
- Comprehensive testing (unit, integration, e2e)
- User documentation and tutorials
- Community launch

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
```bash
# Clone the repository
git clone https://github.com/yourusername/NanoNymNault.git
cd NanoNymNault

# Install dependencies
npm install

# Run development server
npm run dev

# Run tests
npm test
```

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

[To be determined - likely MIT or similar open-source license]

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

**Built with 🔐 for the Nano community**
