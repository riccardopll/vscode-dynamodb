import * as assert from "assert";

import {
  buildItemKey,
  buildIndexQueryInput,
  buildReplaceItemTransactionInput,
  buildUpdateItemInput,
  toAttributeValue,
  unmarshallItems,
} from "../../aws/dynamoService";
import type { TableMetadata } from "../../types";

suite("DynamoDB service helpers", () => {
  const partitionOnlyMetadata: TableMetadata = {
    tableName: "Orders",
    partitionKey: {
      name: "id",
      type: "S",
    },
    globalSecondaryIndexes: [],
  };

  const compositeKeyMetadata: TableMetadata = {
    tableName: "Orders",
    partitionKey: {
      name: "tenantId",
      type: "S",
    },
    sortKey: {
      name: "orderId",
      type: "N",
    },
    globalSecondaryIndexes: [],
  };

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

  test("builds the correct DynamoDB key for partition-only tables", () => {
    const key = buildItemKey(partitionOnlyMetadata, {
      id: "row-1",
      status: "open",
    });

    assert.deepStrictEqual(key, {
      id: { S: "row-1" },
    });
  });

  test("builds the correct DynamoDB key for composite-key tables", () => {
    const key = buildItemKey(compositeKeyMetadata, {
      tenantId: "tenant-1",
      orderId: 42,
      status: "open",
    });

    assert.deepStrictEqual(key, {
      tenantId: { S: "tenant-1" },
      orderId: { N: "42" },
    });
  });

  test("rejects updates when the partition key changes", () => {
    assert.throws(() =>
      buildUpdateItemInput({
        tableName: "Orders",
        metadata: partitionOnlyMetadata,
        originalItem: {
          id: "row-1",
          status: "open",
        },
        updatedItem: {
          id: "row-2",
          status: "closed",
        },
      }),
    );
  });

  test("builds a replace transaction when the sort key changes", () => {
    const input = buildReplaceItemTransactionInput({
      tableName: "Orders",
      metadata: compositeKeyMetadata,
      originalItem: {
        tenantId: "tenant-1",
        orderId: 42,
        status: "open",
      },
      updatedItem: {
        tenantId: "tenant-1",
        orderId: 43,
        status: "closed",
      },
    });

    assert.deepStrictEqual(input, {
      TransactItems: [
        {
          Put: {
            TableName: "Orders",
            Item: {
              tenantId: { S: "tenant-1" },
              orderId: { N: "43" },
              status: { S: "closed" },
            },
          },
        },
        {
          Delete: {
            TableName: "Orders",
            Key: {
              tenantId: { S: "tenant-1" },
              orderId: { N: "42" },
            },
          },
        },
      ],
    });
  });

  test("rejects replace requests when the partition key changes", () => {
    assert.throws(
      () =>
        buildReplaceItemTransactionInput({
          tableName: "Orders",
          metadata: compositeKeyMetadata,
          originalItem: {
            tenantId: "tenant-1",
            orderId: 42,
            status: "open",
          },
          updatedItem: {
            tenantId: "tenant-2",
            orderId: 43,
            status: "closed",
          },
        }),
      /Primary key attribute "tenantId" cannot be edited\./u,
    );
  });

  test("treats equal binary sort keys as unchanged", () => {
    const binaryKeyMetadata: TableMetadata = {
      tableName: "Orders",
      partitionKey: {
        name: "tenantId",
        type: "S",
      },
      sortKey: {
        name: "blobId",
        type: "B",
      },
      globalSecondaryIndexes: [],
    };

    const input = buildUpdateItemInput({
      tableName: "Orders",
      metadata: binaryKeyMetadata,
      originalItem: {
        tenantId: "tenant-1",
        blobId: new Uint8Array([1, 2, 3]),
        status: "open",
      },
      updatedItem: {
        tenantId: "tenant-1",
        blobId: new Uint8Array([1, 2, 3]),
        status: "closed",
      },
    });

    assert.strictEqual(input.UpdateExpression, "SET #attr0 = :value0");
  });

  test("creates a SET-only update for changed non-key attributes", () => {
    const input = buildUpdateItemInput({
      tableName: "Orders",
      metadata: compositeKeyMetadata,
      originalItem: {
        tenantId: "tenant-1",
        orderId: 42,
        status: "open",
        note: "old",
      },
      updatedItem: {
        tenantId: "tenant-1",
        orderId: 42,
        status: "closed",
        note: "new",
      },
    });

    assert.strictEqual(
      input.UpdateExpression,
      "SET #attr0 = :value0, #attr1 = :value1",
    );
    assert.deepStrictEqual(input.ExpressionAttributeNames, {
      "#attr0": "status",
      "#attr1": "note",
    });
    assert.deepStrictEqual(input.ExpressionAttributeValues, {
      ":value0": { S: "closed" },
      ":value1": { S: "new" },
    });
    assert.strictEqual(input.ReturnValues, "ALL_NEW");
  });

  test("marshals object, array, boolean, and null values in updates", () => {
    const input = buildUpdateItemInput({
      tableName: "Orders",
      metadata: partitionOnlyMetadata,
      originalItem: {
        id: "row-1",
        details: {
          total: 10,
        },
        tags: ["new"],
        active: false,
        archivedAt: "2024-01-01",
      },
      updatedItem: {
        id: "row-1",
        details: {
          total: 12,
          currency: "EUR",
        },
        tags: ["new", "vip"],
        active: true,
        archivedAt: null,
      },
    });

    assert.deepStrictEqual(input.ExpressionAttributeValues, {
      ":value0": {
        M: {
          total: { N: "12" },
          currency: { S: "EUR" },
        },
      },
      ":value1": {
        L: [{ S: "new" }, { S: "vip" }],
      },
      ":value2": {
        BOOL: true,
      },
      ":value3": {
        NULL: true,
      },
    });
  });

  test("rejects update requests when there are no editable changes", () => {
    assert.throws(() =>
      buildUpdateItemInput({
        tableName: "Orders",
        metadata: partitionOnlyMetadata,
        originalItem: {
          id: "row-1",
          status: "open",
        },
        updatedItem: {
          id: "row-1",
          status: "open",
        },
      }),
    );
  });
});
