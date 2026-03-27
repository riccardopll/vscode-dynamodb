import * as vscode from "vscode";

import type { SessionState } from "../state/sessionState";
import type { TableSummary } from "../types";

class TableTreeItem extends vscode.TreeItem {
  public readonly tableName?: string;

  public constructor(
    label: string,
    options?: {
      command?: vscode.Command;
      contextValue?: string;
      iconPath?: vscode.ThemeIcon;
      tableName?: string;
      tooltip?: string;
    },
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.command = options?.command;
    this.contextValue = options?.contextValue;
    this.iconPath = options?.iconPath ?? new vscode.ThemeIcon("table");
    this.tableName = options?.tableName;
    this.tooltip = options?.tooltip;
  }
}

export interface VisibleTable {
  name: string;
  isFavorite: boolean;
}

export function getVisibleTables(
  tables: TableSummary[],
  favoriteTables: string[],
  searchQuery: string,
): VisibleTable[] {
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const favoriteTableNames = new Set(favoriteTables);

  return tables
    .filter((table) =>
      normalizedQuery.length === 0
        ? true
        : table.name.toLocaleLowerCase().includes(normalizedQuery),
    )
    .map((table) => ({
      name: table.name,
      isFavorite: favoriteTableNames.has(table.name),
    }))
    .sort((left, right) => {
      if (left.isFavorite !== right.isFavorite) {
        return left.isFavorite ? -1 : 1;
      }

      return left.name.localeCompare(right.name);
    });
}

export class TableTreeProvider implements vscode.TreeDataProvider<TableTreeItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<
    TableTreeItem | undefined
  >();
  private statusMessage: string | undefined;
  private searchQuery = "";

  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  public constructor(private readonly sessionState: SessionState) {
    this.sessionState.onDidChange(() => this.refresh());
  }

  public refresh(message?: string): void {
    this.statusMessage = message;
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  public getSearchQuery(): string {
    return this.searchQuery;
  }

  public hasSearchQuery(): boolean {
    return this.searchQuery.trim().length > 0;
  }

  public setSearchQuery(searchQuery: string): void {
    this.searchQuery = searchQuery;
    this.refresh();
  }

  public clearSearchQuery(): void {
    this.setSearchQuery("");
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

    const visibleTables = getVisibleTables(
      tables,
      this.sessionState.getFavoriteTables(),
      this.searchQuery,
    );
    if (visibleTables.length === 0) {
      return [
        new TableTreeItem(`No tables match "${this.searchQuery.trim()}"`),
      ];
    }

    return visibleTables.map((table) => this.toTreeItem(table));
  }

  private toTreeItem(table: VisibleTable): TableTreeItem {
    return new TableTreeItem(table.name, {
      command: {
        command: "dynamodb.openTableExplorer",
        title: "Open Table Explorer",
        arguments: [table.name],
      },
      contextValue: table.isFavorite
        ? "dynamodbFavoriteTable"
        : "dynamodbTable",
      iconPath: new vscode.ThemeIcon(table.isFavorite ? "star-full" : "table"),
      tableName: table.name,
      tooltip: table.isFavorite ? `${table.name} (favorite)` : table.name,
    });
  }
}
