import * as assert from "assert";

import {
  buildIndexQueryInput,
  toAttributeValue,
  unmarshallItems,
} from "../../aws/dynamoService";

suite("DynamoDB service helpers", () => {
  test("builds a GSI query with partition and sort key equality", () => {
    const input = buildIndexQueryInput({
      tableName: "Orders",
      index: {
        name: "CustomerCreatedAtIndex",
        partitionKey: {
          name: "customerId",
          type: "S",
        },
        sortKey: {
          name: "createdAt",
          type: "N",
        },
      },
      partitionKeyValue: "cust#1",
      sortKeyValue: "1700000000",
      pageSize: 25,
    });

    assert.strictEqual(input.IndexName, "CustomerCreatedAtIndex");
    assert.strictEqual(input.KeyConditionExpression, "#pk = :pk AND #sk = :sk");
    assert.deepStrictEqual(input.ExpressionAttributeNames, {
      "#pk": "customerId",
      "#sk": "createdAt",
    });
  });

  test("converts scalar key types into attribute values", () => {
    assert.deepStrictEqual(toAttributeValue("S", "abc"), { S: "abc" });
    assert.deepStrictEqual(toAttributeValue("N", "42"), { N: "42" });
    assert.deepStrictEqual(toAttributeValue("B", "hello"), {
      B: new TextEncoder().encode("hello"),
    });
  });

  test("rejects invalid numeric key values", () => {
    assert.throws(() => toAttributeValue("N", "forty-two"));
  });

  test("unmarshalls items for display", () => {
    const items = unmarshallItems([
      {
        id: { S: "1" },
        count: { N: "2" },
      },
    ]);

    assert.deepStrictEqual(items, [{ id: "1", count: 2 }]);
  });
});
