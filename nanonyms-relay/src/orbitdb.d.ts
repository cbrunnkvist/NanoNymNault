declare module '@orbitdb/core' {
  import type { Helia } from 'helia';
  
  export interface OrbitDBOptions {
    ipfs: Helia;
    directory?: string;
    id?: string;
  }

  export interface DatabaseOptions {
    type?: string;
    create?: boolean;
    overwrite?: boolean;
    directory?: string;
    meta?: Record<string, unknown>;
    referencesCount?: number;
    syncAutomatically?: boolean;
    AccessController?: any;
    headsStorage?: any;
    entryStorage?: any;
    indexStorage?: any;
  }

  export interface EventEmitter {
    on(event: string, listener: (...args: any[]) => void): void;
  }

  export interface Database {
    address: { toString(): string };
    events: EventEmitter;
    all(): Promise<any[]>;
    add(data: any): Promise<string>;
    get(hash: string): Promise<any>;
    close(): Promise<void>;
  }

  export interface OrbitDB {
    open(name: string, options?: DatabaseOptions): Promise<Database>;
    stop(): Promise<void>;
    id: string;
    peerId: any;
  }

  export function createOrbitDB(options: OrbitDBOptions): Promise<OrbitDB>;
}
