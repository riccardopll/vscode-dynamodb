import * as vscode from "vscode";

import { DynamoService, getErrorMessage } from "./aws/dynamoService";
import { KNOWN_DYNAMODB_REGIONS } from "./aws/profiles";
import { SessionState } from "./state/sessionState";
import type { ConnectionSelection } from "./types";
import { ConnectionTreeProvider } from "./views/connectionTreeProvider";
import { TableTreeProvider } from "./views/tableTreeProvider";
import { TableExplorerPanel } from "./webview/tableExplorerPanel";

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  const service = new DynamoService();
  const sessionState = new SessionState(context.globalState, () =>
    getDefaultRegion(),
  );

  const connectionTreeProvider = new ConnectionTreeProvider(sessionState);
  const tableTreeProvider = new TableTreeProvider(sessionState);

  const connectionTreeView = vscode.window.createTreeView(
    "dynamodbConnection",
    {
      treeDataProvider: connectionTreeProvider,
      showCollapseAll: false,
    },
  );
  const tablesTreeView = vscode.window.createTreeView("dynamodbTables", {
    treeDataProvider: tableTreeProvider,
    showCollapseAll: false,
  });

  context.subscriptions.push(connectionTreeView, tablesTreeView);

  const refreshTables = async (showErrors = true): Promise<void> => {
    const connection = sessionState.getConnection();
    if (!connection) {
      tableTreeProvider.refresh("Select an AWS profile to begin");
      syncMessages(connectionTreeView, tablesTreeView, sessionState, undefined);
      return;
    }

    tableTreeProvider.refresh("Loading DynamoDB tables...");
    syncMessages(connectionTreeView, tablesTreeView, sessionState, undefined);

    try {
      const tables = await service.listTables(connection);
      sessionState.setTables(tables);
      syncMessages(connectionTreeView, tablesTreeView, sessionState, undefined);
    } catch (error) {
      sessionState.clearTables();
      const message = getErrorMessage(error);
      tableTreeProvider.refresh("Unable to load tables");
      syncMessages(connectionTreeView, tablesTreeView, sessionState, message);
      if (showErrors) {
        void vscode.window.showErrorMessage(
          `Unable to load DynamoDB tables for ${connection.profile} in ${connection.region}: ${message}`,
        );
      }
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("dynamodb.selectProfile", async () => {
      const profiles = sessionState.getProfiles();
      if (profiles.length === 0) {
        void vscode.window.showWarningMessage(
          "No AWS profiles were found in ~/.aws/config or ~/.aws/credentials.",
        );
        return;
      }

      const selectedProfile = await vscode.window.showQuickPick(
        profiles.map((profile) => ({
          label: profile.name,
          description: profile.defaultRegion,
        })),
        {
          placeHolder: "Select an AWS profile",
        },
      );

      if (!selectedProfile) {
        return;
      }

      await sessionState.setActiveProfile(selectedProfile.label);
      await refreshTables();
    }),
    vscode.commands.registerCommand("dynamodb.selectRegion", async () => {
      const connection = sessionState.getConnection();
      if (!connection) {
        void vscode.window.showWarningMessage(
          "Select an AWS profile before choosing a region.",
        );
        return;
      }

      const selectedRegion = await vscode.window.showQuickPick(
        buildRegionQuickPickItems(connection),
        {
          placeHolder: "Select an AWS region",
        },
      );

      if (!selectedRegion) {
        return;
      }

      await sessionState.setActiveRegion(selectedRegion.label);
      await refreshTables();
    }),
    vscode.commands.registerCommand("dynamodb.refreshProfiles", async () => {
      try {
        await sessionState.reloadProfiles();
        syncMessages(
          connectionTreeView,
          tablesTreeView,
          sessionState,
          undefined,
        );
        await refreshTables(false);
      } catch (error) {
        const message = getErrorMessage(error);
        syncMessages(connectionTreeView, tablesTreeView, sessionState, message);
        void vscode.window.showErrorMessage(
          `Unable to refresh AWS profiles: ${message}`,
        );
      }
    }),
    vscode.commands.registerCommand("dynamodb.refreshTables", async () => {
      await refreshTables();
    }),
    vscode.commands.registerCommand(
      "dynamodb.openTableExplorer",
      async (tableName: string) => {
        const connection = sessionState.getConnection();
        if (!connection) {
          void vscode.window.showWarningMessage(
            "Select an AWS profile before opening a table explorer.",
          );
          return;
        }

        try {
          const metadata = await service.describeTable(connection, tableName);
          TableExplorerPanel.createOrReveal(
            context.extensionUri,
            service,
            connection,
            metadata,
            getPageSize(),
            getSaveShortcut(),
          );
        } catch (error) {
          void vscode.window.showErrorMessage(
            `Unable to open ${tableName}: ${getErrorMessage(error)}`,
          );
        }
      },
    ),
  );

  await sessionState.initialize();
  syncMessages(connectionTreeView, tablesTreeView, sessionState, undefined);
  await refreshTables(false);
}

export function deactivate(): void {}

function syncMessages(
  connectionTreeView: vscode.TreeView<unknown>,
  tablesTreeView: vscode.TreeView<unknown>,
  sessionState: SessionState,
  tableErrorMessage: string | undefined,
): void {
  const connection = sessionState.getConnection();
  connectionTreeView.message = connection
    ? `${connection.profile} / ${connection.region}`
    : "No AWS profiles found";

  tablesTreeView.message = tableErrorMessage;
}

function buildRegionQuickPickItems(
  connection: ConnectionSelection,
): vscode.QuickPickItem[] {
  const regions = new Set<string>([
    connection.region,
    ...KNOWN_DYNAMODB_REGIONS,
  ]);
  return [...regions]
    .sort((left, right) => left.localeCompare(right))
    .map((region) => ({
      label: region,
      description: region === connection.region ? "Current region" : undefined,
    }));
}

function getDefaultRegion(): string {
  return vscode.workspace
    .getConfiguration()
    .get<string>("dynamodb.defaultRegion", "us-east-1");
}

function getPageSize(): number {
  const configured = vscode.workspace
    .getConfiguration()
    .get<number>("dynamodb.pageSize", 50);

  return Math.max(1, Math.min(500, configured));
}

function getSaveShortcut(): string {
  return vscode.workspace
    .getConfiguration()
    .get<string>("dynamodb.saveShortcut", "Mod+S");
}
