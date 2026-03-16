import * as assert from "assert";

import { collectResultColumns } from "../../webview/results";

suite("Result helpers", () => {
  test("collects sorted top-level columns with partition key first", () => {
    const columns = collectResultColumns(
      [
        { id: "1", name: "Ada" },
        { id: "2", age: 36 },
      ],
      {
        partitionKey: { name: "id", type: "S" },
      },
    );

    assert.deepStrictEqual(columns, ["id", "age", "name"]);
  });

  test("sorts partition key first, sort key second, then remaining columns", () => {
    const columns = collectResultColumns(
      [
        { status: "open", orderId: 10, tenantId: "t1", total: 42 },
        { tenantId: "t2", orderId: 11, customerId: "c1" },
      ],
      {
        partitionKey: { name: "tenantId", type: "S" },
        sortKey: { name: "orderId", type: "N" },
      },
    );

    assert.deepStrictEqual(columns, [
      "tenantId",
      "orderId",
      "customerId",
      "status",
      "total",
    ]);
  });
});
