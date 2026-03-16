import * as assert from "assert";

import { selectInitialProfile } from "../../state/sessionState";

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
});
