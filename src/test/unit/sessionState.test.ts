import * as assert from "assert";

import { SessionState, selectInitialProfile } from "../../state/sessionState";

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

suite("SessionState profile selection", () => {
  test("prefers a persisted profile when it exists", () => {
    const profile = selectInitialProfile(
      [{ name: "default" }, { name: "sandbox" }],
      "sandbox",
    );

    assert.strictEqual(profile?.name, "sandbox");
  });

  test("falls back to the default profile when nothing is persisted", () => {
    const profile = selectInitialProfile(
      [{ name: "dev" }, { name: "default" }, { name: "prod" }],
      undefined,
    );

    assert.strictEqual(profile?.name, "default");
  });

  test("falls back to the first profile when default is unavailable", () => {
    const profile = selectInitialProfile(
      [{ name: "dev" }, { name: "prod" }],
      undefined,
    );

    assert.strictEqual(profile?.name, "dev");
  });

  test("stores favorite tables per connection", async () => {
    const sessionState = new SessionState(new FakeMemento(), () => "us-east-1");

    setConnection(sessionState, {
      profile: "dev",
      region: "eu-central-1",
    });

    await sessionState.setFavoriteTable("Users", true);

    assert.deepStrictEqual(sessionState.getFavoriteTables(), ["Users"]);
  });

  test("does not leak favorite tables across connections", async () => {
    const sessionState = new SessionState(new FakeMemento(), () => "us-east-1");

    setConnection(sessionState, {
      profile: "dev",
      region: "eu-central-1",
    });
    await sessionState.setFavoriteTable("Users", true);

    setConnection(sessionState, {
      profile: "dev",
      region: "us-east-1",
    });
    assert.deepStrictEqual(sessionState.getFavoriteTables(), []);

    await sessionState.setFavoriteTable("Orders", true);
    assert.deepStrictEqual(sessionState.getFavoriteTables(), ["Orders"]);

    setConnection(sessionState, {
      profile: "dev",
      region: "eu-central-1",
    });
    assert.deepStrictEqual(sessionState.getFavoriteTables(), ["Users"]);
  });

  test("toggles the same favorite table on and off", async () => {
    const sessionState = new SessionState(new FakeMemento(), () => "us-east-1");

    setConnection(sessionState, {
      profile: "dev",
      region: "eu-central-1",
    });

    assert.strictEqual(await sessionState.toggleFavoriteTable("Users"), true);
    assert.deepStrictEqual(sessionState.getFavoriteTables(), ["Users"]);

    assert.strictEqual(await sessionState.toggleFavoriteTable("Users"), false);
    assert.deepStrictEqual(sessionState.getFavoriteTables(), []);
  });
});

function setConnection(
  sessionState: SessionState,
  connection: { profile: string; region: string },
): void {
  (
    sessionState as unknown as {
      connection?: { profile: string; region: string };
    }
  ).connection = connection;
}
