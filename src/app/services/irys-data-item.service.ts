import { Injectable } from '@angular/core';
import { sha384 } from '@noble/hashes/sha512';
import { keccak_256 } from '@noble/hashes/sha3';
import { sha256 } from '@noble/hashes/sha256';
import * as secp256k1 from '@noble/secp256k1';
import { bytesToHex, hexToBytes } from '@noble/curves/abstract/utils';

const IRYS_DEVNET_ENDPOINT = 'https://devnet.irys.xyz/tx/ethereum';
const SIGNATURE_TYPE_ETHEREUM = 3;

interface DataItemTag {
  name: string;
  value: string;
}

@Injectable({
  providedIn: 'root'
})
export class IrysDataItemService {

  async createAndUploadDataItem(
    privateKeyHex: string,
    data: Uint8Array,
    tags: DataItemTag[]
  ): Promise<string | null> {
    try {
      const dataItem = await this.createDataItem(privateKeyHex, data, tags);
      return await this.uploadDataItem(dataItem);
    } catch (e) {
      console.error('[IrysDataItem] Failed to create/upload:', e);
      return null;
    }
  }

  async createDataItem(
    privateKeyHex: string,
    data: Uint8Array,
    tags: DataItemTag[],
    target?: Uint8Array,
    anchor?: Uint8Array
  ): Promise<Uint8Array> {
    const privateKey = privateKeyHex.startsWith('0x')
      ? hexToBytes(privateKeyHex.slice(2))
      : hexToBytes(privateKeyHex);

    const publicKeyFull = secp256k1.getPublicKey(privateKey, false);

    const serializedTags = this.serializeAvroTags(tags);

    const targetPresent = target ? 1 : 0;
    const anchorPresent = anchor ? 1 : 0;

    const headerSize =
      2 +
      65 +
      65 +
      1 + (target ? 32 : 0) +
      1 + (anchor ? 32 : 0) +
      8 +
      8;

    const totalSize = headerSize + serializedTags.length + data.length;
    const binary = new Uint8Array(totalSize);
    let offset = 0;

    binary[offset++] = SIGNATURE_TYPE_ETHEREUM & 0xff;
    binary[offset++] = (SIGNATURE_TYPE_ETHEREUM >> 8) & 0xff;

    const signatureOffset = offset;
    offset += 65;

    binary.set(publicKeyFull, offset);
    offset += 65;

    binary[offset++] = targetPresent;
    if (target) {
      binary.set(target, offset);
      offset += 32;
    }

    binary[offset++] = anchorPresent;
    if (anchor) {
      binary.set(anchor, offset);
      offset += 32;
    }

    this.writeLittleEndian64(binary, offset, tags.length);
    offset += 8;
    this.writeLittleEndian64(binary, offset, serializedTags.length);
    offset += 8;

    binary.set(serializedTags, offset);
    offset += serializedTags.length;

    binary.set(data, offset);

    const deepHashResult = await this.deepHash([
      this.textToBytes('dataitem'),
      this.textToBytes('1'),
      this.textToBytes(SIGNATURE_TYPE_ETHEREUM.toString()),
      publicKeyFull,
      target || new Uint8Array(0),
      anchor || new Uint8Array(0),
      serializedTags,
      data
    ]);

    const signature = await this.signEthereumMessage(deepHashResult, privateKey);

    binary.set(signature, signatureOffset);

    return binary;
  }

  private async deepHash(data: (Uint8Array | (Uint8Array | Uint8Array[])[])[]): Promise<Uint8Array> {
    return this.deepHashChunk(data);
  }

  private deepHashChunk(data: Uint8Array | any[]): Uint8Array {
    if (data instanceof Uint8Array) {
      const tag = this.concat([
        this.textToBytes('blob'),
        this.textToBytes(data.length.toString())
      ]);
      const tagHash = sha384(tag);
      const dataHash = sha384(data);
      return sha384(this.concat([tagHash, dataHash]));
    }

    const tag = this.concat([
      this.textToBytes('list'),
      this.textToBytes(data.length.toString())
    ]);
    const tagHash = sha384(tag);

    let acc = tagHash;
    for (const item of data) {
      const itemHash = this.deepHashChunk(item);
      acc = sha384(this.concat([acc, itemHash]));
    }

    return acc;
  }

  private async signEthereumMessage(message: Uint8Array, privateKey: Uint8Array): Promise<Uint8Array> {
    const prefix = this.textToBytes('\x19Ethereum Signed Message:\n' + message.length);
    const prefixedMessage = this.concat([prefix, message]);
    const messageHash = keccak_256(prefixedMessage);

    const recoveredSig = secp256k1.sign(messageHash, privateKey, {
      prehash: false,
      format: 'recovered'
    });

    const signature = new Uint8Array(65);
    signature.set(recoveredSig.slice(0, 64), 0);
    signature[64] = recoveredSig[64] + 27;

    return signature;
  }

  private serializeAvroTags(tags: DataItemTag[]): Uint8Array {
    if (tags.length === 0) {
      return new Uint8Array([0]);
    }

    const parts: Uint8Array[] = [];

    parts.push(new Uint8Array(this.encodeZigZagVInt(tags.length)));

    for (const tag of tags) {
      const nameBytes = this.textToBytes(tag.name);
      const valueBytes = this.textToBytes(tag.value);

      parts.push(new Uint8Array(this.encodeZigZagVInt(nameBytes.length)));
      parts.push(nameBytes);
      parts.push(new Uint8Array(this.encodeZigZagVInt(valueBytes.length)));
      parts.push(valueBytes);
    }

    parts.push(new Uint8Array([0]));

    return this.concat(parts);
  }

  private encodeZigZagVInt(n: number): number[] {
    const zigzag = n >= 0 ? n << 1 : (~n << 1) | 1;
    return this.encodeVInt(zigzag);
  }

  private encodeVInt(n: number): number[] {
    const bytes: number[] = [];
    let value = n;
    do {
      let byte = value & 0x7f;
      value >>>= 7;
      if (value) byte |= 0x80;
      bytes.push(byte);
    } while (value);
    return bytes;
  }

  private async uploadDataItem(dataItem: Uint8Array): Promise<string> {
    console.log(`[IrysDataItem] Uploading ${dataItem.length} bytes to Irys devnet...`);

    const response = await fetch(IRYS_DEVNET_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      body: dataItem,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Upload failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('[IrysDataItem] Upload successful:', result);

    return result.id;
  }

  getDataItemId(dataItem: Uint8Array): string {
    const signature = dataItem.slice(2, 67);
    const hash = sha256(signature);
    return this.base64UrlEncode(hash);
  }

  private writeLittleEndian64(buffer: Uint8Array, offset: number, value: number): void {
    for (let i = 0; i < 8; i++) {
      buffer[offset + i] = (value >> (i * 8)) & 0xff;
    }
  }

  private textToBytes(text: string): Uint8Array {
    return new TextEncoder().encode(text);
  }

  private concat(arrays: Uint8Array[]): Uint8Array {
    const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of arrays) {
      result.set(arr, offset);
      offset += arr.length;
    }
    return result;
  }

  private base64UrlEncode(data: Uint8Array): string {
    const base64 = btoa(String.fromCharCode(...data));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
}
