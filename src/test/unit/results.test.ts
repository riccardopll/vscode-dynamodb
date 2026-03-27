import * as assert from "assert";

import {
  collectColumnMinWidths,
  collectResultColumns,
} from "../../webview/results";

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

  test("collects buffered minimum widths from the widest loaded content", () => {
    const widths = collectColumnMinWidths(
      ["id", "payload", "sortKey"],
      [
        { id: "1", payload: "short", sortKey: 7 },
        { id: "22", payload: { status: "expanded" }, sortKey: 12 },
      ],
      {
        partitionKey: { name: "id", type: "S" },
        sortKey: { name: "sortKey", type: "N" },
      },
    );

    assert.deepStrictEqual(widths, {
      id: "5ch",
      payload: "21ch",
      sortKey: "10ch",
    });
  });
});
