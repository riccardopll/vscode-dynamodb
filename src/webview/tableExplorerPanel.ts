import * as vscode from "vscode";

import { DynamoService, getErrorMessage } from "../aws/dynamoService";
import type {
  ConnectionSelection,
  DynamoCursor,
  IndexMetadata,
  TableMetadata,
} from "../types";
import { getTableExplorerHtml } from "./html";
import type {
  ExplorerBootstrap,
  ExtensionToWebviewMessage,
  WebviewToExtensionMessage,
} from "./protocol";

export class TableExplorerPanel implements vscode.Disposable {
  private static readonly panels = new Map<string, TableExplorerPanel>();

  public static createOrReveal(
    extensionUri: vscode.Uri,
    service: DynamoService,
    connection: ConnectionSelection,
    metadata: TableMetadata,
    pageSize: number,
  ): void {
    const key = TableExplorerPanel.getPanelKey(connection, metadata.tableName);
    const existingPanel = TableExplorerPanel.panels.get(key);
    if (existingPanel) {
      existingPanel.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "dynamodbTableExplorer",
      `${metadata.tableName} (${connection.region})`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "dist")],
        retainContextWhenHidden: true,
      },
    );

    const explorerPanel = new TableExplorerPanel(
      key,
      panel,
      extensionUri,
      service,
      connection,
      metadata,
      pageSize,
    );

    TableExplorerPanel.panels.set(key, explorerPanel);
  }

  private constructor(
    private readonly panelKey: string,
    private readonly panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    private readonly service: DynamoService,
    private readonly connection: ConnectionSelection,
    private readonly metadata: TableMetadata,
    private readonly pageSize: number,
  ) {
    const bootstrap: ExplorerBootstrap = {
      profile: connection.profile,
      region: connection.region,
      pageSize,
      metadata,
    };

    this.panel.webview.html = getTableExplorerHtml(
      this.panel.webview,
      this.extensionUri,
      bootstrap,
    );

    this.panel.onDidDispose(() => this.dispose());
    this.panel.webview.onDidReceiveMessage(
      (message: WebviewToExtensionMessage) => this.handleMessage(message),
    );
  }

  public dispose(): void {
    TableExplorerPanel.panels.delete(this.panelKey);
  }

  private async handleMessage(
    message: WebviewToExtensionMessage,
  ): Promise<void> {
    switch (message.type) {
      case "copyItem":
        await vscode.env.clipboard.writeText(
          JSON.stringify(message.item, null, 2),
        );
        return;
      case "runScan":
        await this.withLoading(async () => {
          const result = await this.service.scanTable(
            this.connection,
            this.metadata.tableName,
            this.pageSize,
            message.cursor,
          );

          this.postMessage({
            type: "results",
            mode: "scan",
            append: Boolean(message.cursor),
            items: result.items,
            cursor: result.lastEvaluatedKey,
          });
        });
        return;
      case "runQuery":
        await this.withLoading(async () => {
          const index = this.metadata.globalSecondaryIndexes.find(
            (candidate) => candidate.name === message.indexName,
          );
          if (!index) {
            throw new Error(`Index "${message.indexName}" was not found.`);
          }

          const result = await this.service.queryIndex(this.connection, {
            tableName: this.metadata.tableName,
            index,
            partitionKeyValue: message.partitionKeyValue,
            sortKeyValue: message.sortKeyValue,
            pageSize: this.pageSize,
            cursor: message.cursor,
          });

          this.postMessage({
            type: "results",
            mode: "query-index",
            append: Boolean(message.cursor),
            items: result.items,
            cursor: result.lastEvaluatedKey,
          });
        });
    }
  }

  private async withLoading(action: () => Promise<void>): Promise<void> {
    this.postMessage({
      type: "setLoading",
      loading: true,
    });

    try {
      await action();
      this.postMessage({
        type: "error",
        message: "",
      });
    } catch (error) {
      this.postMessage({
        type: "error",
        message: getErrorMessage(error),
      });
    } finally {
      this.postMessage({
        type: "setLoading",
        loading: false,
      });
    }
  }

  private postMessage(message: ExtensionToWebviewMessage): void {
    void this.panel.webview.postMessage(message);
  }

  private static getPanelKey(
    connection: ConnectionSelection,
    tableName: string,
  ): string {
    return `${connection.profile}:${connection.region}:${tableName}`;
  }
}
