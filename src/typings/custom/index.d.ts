declare module "worker-loader!*" {
  class WebpackWorker extends Worker {
    constructor();
  }
  export default WebpackWorker;
}

declare module "*/nanoidenticons.min.js" {
  export function createIcon(options: { seed: string; scale: number }): HTMLCanvasElement;
}