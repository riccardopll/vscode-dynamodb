import * as assert from "assert";

import { matchesShortcut, parseShortcut } from "../../webview/shortcuts";

suite("Shortcut helpers", () => {
  test("parses Mod+S", () => {
    assert.deepStrictEqual(parseShortcut("Mod+S"), {
      key: "s",
      metaKey: true,
      ctrlKey: true,
      altKey: false,
      shiftKey: false,
    });
  });

  test("matches ctrl or cmd for Mod+S", () => {
    assert.strictEqual(
      matchesShortcut(
        {
          key: "s",
          metaKey: false,
          ctrlKey: true,
          altKey: false,
          shiftKey: false,
        } as KeyboardEvent,
        "Mod+S",
      ),
      true,
    );

    assert.strictEqual(
      matchesShortcut(
        {
          key: "s",
          metaKey: true,
          ctrlKey: false,
          altKey: false,
          shiftKey: false,
        } as KeyboardEvent,
        "Mod+S",
      ),
      true,
    );
  });

  test("matches a custom shortcut exactly", () => {
    assert.strictEqual(
      matchesShortcut(
        {
          key: "enter",
          metaKey: false,
          ctrlKey: true,
          altKey: true,
          shiftKey: false,
        } as KeyboardEvent,
        "Ctrl+Alt+Enter",
      ),
      true,
    );
  });

  test("treats an empty shortcut as disabled", () => {
    assert.strictEqual(parseShortcut(""), undefined);
  });
});
