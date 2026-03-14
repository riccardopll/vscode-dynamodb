import * as assert from "assert";

import { appendResultRows, collectResultColumns } from "../../webview/results";

suite("Result helpers", () => {
  test("appends paginated results", () => {
    const combined = appendResultRows([{ id: "1" }], [{ id: "2" }], true);

    assert.deepStrictEqual(combined, [{ id: "1" }, { id: "2" }]);
  });

  test("collects sorted top-level columns", () => {
    const columns = collectResultColumns([
      { id: "1", name: "Ada" },
      { id: "2", age: 36 },
    ]);

    assert.deepStrictEqual(columns, ["age", "id", "name"]);
  });
});
