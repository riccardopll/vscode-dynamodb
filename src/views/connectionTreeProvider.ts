import * as vscode from "vscode";

import type { SessionState } from "../state/sessionState";

type ConnectionItemKind = "profile" | "region" | "refresh" | "empty";

class ConnectionTreeItem extends vscode.TreeItem {
  public constructor(
    label: string,
    public readonly kind: ConnectionItemKind,
    options?: {
      description?: string;
      command?: vscode.Command;
      iconPath?: vscode.ThemeIcon;
    },
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = options?.description;
    this.command = options?.command;
    this.iconPath = options?.iconPath;
  }
}

export class ConnectionTreeProvider implements vscode.TreeDataProvider<ConnectionTreeItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<
    ConnectionTreeItem | undefined
  >();

  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  public constructor(private readonly sessionState: SessionState) {
    this.sessionState.onDidChange(() => this.refresh());
  }

  public refresh(): void {
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  public getTreeItem(element: ConnectionTreeItem): vscode.TreeItem {
    return element;
  }

  public getChildren(): ConnectionTreeItem[] {
    const connection = this.sessionState.getConnection();
    if (!connection) {
      return [
        new ConnectionTreeItem("No AWS profiles found", "empty", {
          iconPath: new vscode.ThemeIcon("warning"),
        }),
      ];
    }

    return [
      new ConnectionTreeItem("Profile", "profile", {
        description: connection.profile,
        iconPath: new vscode.ThemeIcon("account"),
        command: {
          command: "dynamodb.selectProfile",
          title: "Select AWS Profile",
        },
      }),
      new ConnectionTreeItem("Region", "region", {
        description: connection.region,
        iconPath: new vscode.ThemeIcon("globe"),
        command: {
          command: "dynamodb.selectRegion",
          title: "Select Region",
        },
      }),
      new ConnectionTreeItem("Refresh", "refresh", {
        iconPath: new vscode.ThemeIcon("refresh"),
        command: {
          command: "dynamodb.refreshProfiles",
          title: "Refresh Profiles",
        },
      }),
    ];
  }
}
