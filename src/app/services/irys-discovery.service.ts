import { Injectable } from '@angular/core';
import { blake2b } from 'blakejs';
import * as nacl from 'tweetnacl';
import { edwardsToMontgomeryPub } from '@noble/curves/ed25519';
import { bytesToHex } from '@noble/curves/abstract/utils';
import { UtilService } from './util.service';

const ARWEAVE_GRAPHQL_ENDPOINT = 'https://arweave.net/graphql';
const IRYS_GATEWAY = 'https://gateway.irys.xyz';
const PROTOCOL_TAG = 'NanoNym-Signal';

export interface IrysNotification {
  txId: string;
  timestamp: number;
  encryptedPayload: Uint8Array;
}

export interface DecryptedIrysNotification {
  txId: string;
  timestamp: number;
  R: string;
  nano_tx_hash: string;
  amount_raw?: string;
  memo?: string;
}

@Injectable({
  providedIn: 'root'
})
export class IrysDiscoveryService {
  constructor(private util: UtilService) {}

  deriveBlindIndex(nostrPublicKey: Uint8Array): string {
    const hash = blake2b(nostrPublicKey, undefined, 32);
    return bytesToHex(new Uint8Array(hash));
  }

  encryptPayload(
    payload: object,
    recipientViewPublic: Uint8Array
  ): { encrypted: Uint8Array; nonce: Uint8Array; ephemeralPublic: Uint8Array } {
    const ephemeralKeyPair = nacl.box.keyPair();
    const recipientX25519Public = edwardsToMontgomeryPub(recipientViewPublic);
    const nonce = nacl.randomBytes(24);
    const messageBytes = new TextEncoder().encode(JSON.stringify(payload));

    const encrypted = nacl.box(
      messageBytes,
      nonce,
      recipientX25519Public,
      ephemeralKeyPair.secretKey
    );

    return {
      encrypted,
      nonce,
      ephemeralPublic: ephemeralKeyPair.publicKey
    };
  }

  decryptPayload(
    encrypted: Uint8Array,
    nonce: Uint8Array,
    senderEphemeralPublic: Uint8Array,
    recipientViewPrivate: Uint8Array
  ): object | null {
    const viewPrivateScalar = this.blake2bToX25519Scalar(recipientViewPrivate);

    const decrypted = nacl.box.open(
      encrypted,
      nonce,
      senderEphemeralPublic,
      viewPrivateScalar
    );

    if (!decrypted) {
      console.warn('[IrysDiscovery] Failed to decrypt payload');
      return null;
    }

    try {
      const jsonStr = new TextDecoder().decode(decrypted);
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error('[IrysDiscovery] Failed to parse decrypted payload:', e);
      return null;
    }
  }

  async queryNotifications(
    blindIndex: string,
    since?: number
  ): Promise<IrysNotification[]> {
    const query = `
      query {
        transactions(
          tags: [
            { name: "Protocol", values: ["${PROTOCOL_TAG}"] },
            { name: "Blind-Index", values: ["${blindIndex}"] }
          ]
          first: 100
          sort: HEIGHT_DESC
        ) {
          edges {
            node {
              id
              tags {
                name
                value
              }
              block {
                timestamp
              }
            }
          }
        }
      }
    `;

    try {
      const response = await fetch(ARWEAVE_GRAPHQL_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });

      if (!response.ok) {
        throw new Error(`Arweave GraphQL error: ${response.status}`);
      }

      const result = await response.json();
      const edges = result?.data?.transactions?.edges || [];

      const notifications: IrysNotification[] = [];

      for (const edge of edges) {
        const node = edge.node;
        const timestamp = node.block?.timestamp || Math.floor(Date.now() / 1000);

        if (since && timestamp < since) {
          continue;
        }

        try {
          const dataResponse = await fetch(`${IRYS_GATEWAY}/${node.id}`);
          if (!dataResponse.ok) {
            console.warn(`[IrysDiscovery] Failed to fetch data for ${node.id}`);
            continue;
          }

          const dataBuffer = await dataResponse.arrayBuffer();
          notifications.push({
            txId: node.id,
            timestamp,
            encryptedPayload: new Uint8Array(dataBuffer)
          });
        } catch (e) {
          console.warn(`[IrysDiscovery] Error fetching notification ${node.id}:`, e);
        }
      }

      return notifications;
    } catch (e) {
      console.error('[IrysDiscovery] Query failed:', e);
      return [];
    }
  }

  async uploadNotification(
    _seed: string | Uint8Array,
    _blindIndex: string,
    _encryptedData: Uint8Array,
    _nonce: Uint8Array,
    _ephemeralPublic: Uint8Array
  ): Promise<string | null> {
    console.warn('[IrysDiscovery] Upload not implemented - Irys SDK requires Node.js crypto polyfills');
    console.warn('[IrysDiscovery] Tier 2 backup skipped. Nostr notification is primary channel.');
    return null;
  }

  parseEncryptedPayload(data: Uint8Array): {
    version: number;
    nonce: Uint8Array;
    ephemeralPublic: Uint8Array;
    encrypted: Uint8Array;
  } | null {
    if (data.length < 1 + 24 + 32 + 1) {
      console.warn('[IrysDiscovery] Data too short to parse');
      return null;
    }

    const version = data[0];
    if (version !== 1) {
      console.warn(`[IrysDiscovery] Unknown payload version: ${version}`);
      return null;
    }

    let offset = 1;
    const nonce = data.slice(offset, offset + 24);
    offset += 24;
    const ephemeralPublic = data.slice(offset, offset + 32);
    offset += 32;
    const encrypted = data.slice(offset);

    return { version, nonce, ephemeralPublic, encrypted };
  }

  async recoverNotificationsForNanoNym(
    nostrPublicKey: Uint8Array,
    viewPrivateKey: Uint8Array,
    since?: number
  ): Promise<DecryptedIrysNotification[]> {
    const blindIndex = this.deriveBlindIndex(nostrPublicKey);
    console.log(`[IrysDiscovery] Recovering notifications for blind index: ${blindIndex.substring(0, 16)}...`);

    const encryptedNotifications = await this.queryNotifications(blindIndex, since);
    console.log(`[IrysDiscovery] Found ${encryptedNotifications.length} encrypted notifications`);

    const decrypted: DecryptedIrysNotification[] = [];

    for (const notification of encryptedNotifications) {
      const parsed = this.parseEncryptedPayload(notification.encryptedPayload);
      if (!parsed) continue;

      const payload = this.decryptPayload(
        parsed.encrypted,
        parsed.nonce,
        parsed.ephemeralPublic,
        viewPrivateKey
      );

      if (payload && typeof payload === 'object') {
        const p = payload as any;
        decrypted.push({
          txId: notification.txId,
          timestamp: notification.timestamp,
          R: p.R || '',
          nano_tx_hash: p.tx_hash || p.nano_tx_hash || '',
          amount_raw: p.amount_raw,
          memo: p.memo
        });
      }
    }

    console.log(`[IrysDiscovery] Successfully decrypted ${decrypted.length} notifications`);
    return decrypted;
  }

  private blake2bToX25519Scalar(ed25519Private: Uint8Array): Uint8Array {
    const hash = blake2b(ed25519Private, undefined, 64);
    const scalar = new Uint8Array(hash.slice(0, 32));

    scalar[0] &= 248;
    scalar[31] &= 127;
    scalar[31] |= 64;

    return scalar;
  }
}
