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
    const sessionState = await createSessionState();

    await sessionState.setFavoriteTable("Users", true);

    assert.deepStrictEqual(sessionState.getFavoriteTables(), ["Users"]);
  });

  test("does not leak favorite tables across connections", async () => {
    const sessionState = await createSessionState();
    await sessionState.setFavoriteTable("Users", true);

    await sessionState.setActiveRegion("us-east-1");
    assert.deepStrictEqual(sessionState.getFavoriteTables(), []);

    await sessionState.setFavoriteTable("Orders", true);
    assert.deepStrictEqual(sessionState.getFavoriteTables(), ["Orders"]);

    await sessionState.setActiveRegion("eu-central-1");
    assert.deepStrictEqual(sessionState.getFavoriteTables(), ["Users"]);
  });

  test("adds and removes the same favorite table", async () => {
    const sessionState = await createSessionState();

    assert.strictEqual(
      await sessionState.setFavoriteTable("Users", true),
      true,
    );
    assert.deepStrictEqual(sessionState.getFavoriteTables(), ["Users"]);

    assert.strictEqual(
      await sessionState.setFavoriteTable("Users", false),
      false,
    );
    assert.deepStrictEqual(sessionState.getFavoriteTables(), []);
  });
});

async function createSessionState(): Promise<SessionState> {
  const sessionState = new SessionState(
    new FakeMemento(),
    () => "us-east-1",
    async () => [{ name: "dev" }],
  );

  await sessionState.initialize();
  await sessionState.setActiveRegion("eu-central-1");

  return sessionState;
}
