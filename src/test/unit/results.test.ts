import * as assert from "assert";

import { collectResultColumns } from "../../webview/results";

suite("Result helpers", () => {
  test("collects sorted top-level columns", () => {
    const columns = collectResultColumns([
      { id: "1", name: "Ada" },
      { id: "2", age: 36 },
    ]);

    assert.deepStrictEqual(columns, ["age", "id", "name"]);
  });
});
