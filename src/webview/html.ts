import * as vscode from "vscode";

import type { ExplorerBootstrap } from "./protocol";

export function getTableExplorerHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  bootstrap: ExplorerBootstrap,
): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "dist", "webview", "app.js"),
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "dist", "webview", "app.css"),
  );
  const nonce = getNonce();
  const bootstrapJson = JSON.stringify(bootstrap).replace(/</gu, "\\u003c");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>DynamoDB Explorer</title>
    <link rel="stylesheet" href="${styleUri.toString()}" />
    <script nonce="${nonce}">
      window.__DYNAMODB_BOOTSTRAP__ = ${bootstrapJson};
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}" type="module" src="${scriptUri.toString()}"></script>
  </body>
</html>`;
}

function getNonce(): string {
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";

  for (let index = 0; index < 32; index += 1) {
    nonce += possible.charAt(Math.floor(Math.random() * possible.length));
  }

  return nonce;
}
