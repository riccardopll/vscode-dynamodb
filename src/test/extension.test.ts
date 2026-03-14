import * as assert from "assert";

import * as vscode from "vscode";

suite("Extension Test Suite", () => {
  test("registers DynamoDB commands on activation", async function () {
    // Activation does real filesystem and extension-host work.
    // The default Mocha timeout is too tight for VS Code integration tests.
    this.timeout(10_000);

    try {
      await vscode.commands.executeCommand(
        "dynamodb.openTableExplorer",
        "TestTable",
      );
    } catch {
      // The command may fail before opening a table, but activation still happens.
    }

    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes("dynamodb.selectProfile"));
    assert.ok(commands.includes("dynamodb.selectRegion"));
    assert.ok(commands.includes("dynamodb.refreshProfiles"));
    assert.ok(commands.includes("dynamodb.refreshTables"));
    assert.ok(commands.includes("dynamodb.openTableExplorer"));
  });
});
