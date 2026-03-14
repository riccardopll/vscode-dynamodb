import { mount } from "svelte";

import App from "./App.svelte";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Missing app root.");
}

mount(App, {
  target: rootElement,
  props: {
    bootstrap: window.__DYNAMODB_BOOTSTRAP__,
    vscode: acquireVsCodeApi(),
  },
});
