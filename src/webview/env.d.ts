import type { ExplorerBootstrap, WebviewToExtensionMessage } from "./protocol";

declare global {
  interface Window {
    __DYNAMODB_BOOTSTRAP__: ExplorerBootstrap;
  }

  function acquireVsCodeApi(): {
    postMessage(message: WebviewToExtensionMessage): void;
  };
}

export {};
