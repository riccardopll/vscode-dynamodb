import * as assert from "assert";

import { SessionState } from "../../state/sessionState";
import { TableTreeProvider } from "../../views/tableTreeProvider";

class FakeMemento {
  private readonly store = new Map<string, unknown>();

  public get<T>(key: string): T | undefined {
    return this.store.get(key) as T | undefined;
  }

  public async update(key: string, value: unknown): Promise<void> {
    this.store.set(key, value);
  }

  public keys(): readonly string[] {
    return [...this.store.keys()];
  }
}

suite("TableTreeProvider", () => {
  test("shows favorites before other tables and sorts alphabetically", async () => {
    const sessionState = createSessionState([
      "Users",
      "Accounts",
      "Orders",
      "Alerts",
    ]);
    await sessionState.setFavoriteTable("Users", true);
    await sessionState.setFavoriteTable("Orders", true);

    const provider = new TableTreeProvider(sessionState);

    assert.deepStrictEqual(getLabels(provider), [
      "Orders",
      "Users",
      "Accounts",
      "Alerts",
    ]);
  });

  test("filters matching tables and keeps favorites first", async () => {
    const sessionState = createSessionState([
      "Users",
      "Orders",
      "OrderArchive",
      "Alerts",
    ]);
    await sessionState.setFavoriteTable("OrderArchive", true);

    const provider = new TableTreeProvider(sessionState);
    provider.setSearchQuery("ord");

    assert.deepStrictEqual(getLabels(provider), ["OrderArchive", "Orders"]);
  });

  test("shows an explicit empty state when a search has no matches", () => {
    const sessionState = createSessionState(["Users", "Orders"]);
    const provider = new TableTreeProvider(sessionState);

    provider.setSearchQuery("missing");

    assert.deepStrictEqual(getLabels(provider), ['No tables match "missing"']);
  });
});

function createSessionState(tableNames: string[]): SessionState {
  const sessionState = new SessionState(new FakeMemento(), () => "us-east-1");

  (
    sessionState as unknown as {
      connection?: { profile: string; region: string };
      tables?: { name: string }[];
    }
  ).connection = {
    profile: "dev",
    region: "eu-central-1",
  };
  (
    sessionState as unknown as {
      tables?: { name: string }[];
    }
  ).tables = tableNames.map((name) => ({ name }));

  return sessionState;
}

function getLabels(provider: TableTreeProvider): string[] {
  return provider
    .getChildren()
    .map((item) =>
      typeof item.label === "string" ? item.label : (item.label?.label ?? ""),
    );
}
