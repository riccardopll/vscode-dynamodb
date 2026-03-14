import * as vscode from "vscode";

import type { SessionState } from "../state/sessionState";
import type { TableSummary } from "../types";

class TableTreeItem extends vscode.TreeItem {
  public constructor(label: string, command?: vscode.Command) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.command = command;
    this.iconPath = new vscode.ThemeIcon("table");
  }
}

export class TableTreeProvider implements vscode.TreeDataProvider<TableTreeItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<
    TableTreeItem | undefined
  >();
  private statusMessage: string | undefined;

  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  public constructor(private readonly sessionState: SessionState) {
    this.sessionState.onDidChange(() => this.refresh());
  }

  public refresh(message?: string): void {
    this.statusMessage = message;
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  public getTreeItem(element: TableTreeItem): vscode.TreeItem {
    return element;
  }

  public getChildren(): TableTreeItem[] {
    const connection = this.sessionState.getConnection();
    if (!connection) {
      return [new TableTreeItem("Select an AWS profile to begin")];
    }

    if (this.statusMessage) {
      return [new TableTreeItem(this.statusMessage)];
    }

    const tables = this.sessionState.getTables();
    if (tables.length === 0) {
      return [new TableTreeItem("No DynamoDB tables found")];
    }

    return tables.map((table) => this.toTreeItem(table));
  }

  private toTreeItem(table: TableSummary): TableTreeItem {
    return new TableTreeItem(table.name, {
      command: "dynamodb.openTableExplorer",
      title: "Open Table Explorer",
      arguments: [table.name],
    });
  }
}
