/* SystemJS module definition */
declare var module: NodeModule;
interface NodeModule {
  id: string;
}

interface Window {
  require: NodeRequire;
  nacl: any; // Nault uses custom nacl build with extended API
}
