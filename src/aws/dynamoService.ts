import {
  DescribeTableCommand,
  ListTablesCommand,
  TransactWriteItemsCommand,
  type TransactWriteItemsCommandInput,
  QueryCommand,
  type QueryCommandInput,
  ScanCommand,
  UpdateItemCommand,
  type UpdateItemCommandInput,
  type AttributeValue,
  type DescribeTableCommandOutput,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

import type {
  ConnectionSelection,
  DynamoCursor,
  IndexMetadata,
  KeyMetadata,
  ResultPage,
  ScalarKeyType,
  TableMetadata,
  TableSummary,
} from "../types";
import { buildPrimaryKeyRecord, getPrimaryKeys } from "../itemKeys";
import { areValuesEqual } from "../valueEquality";
import { createDynamoDbClient } from "./dynamoClient";

interface QueryIndexInputArgs {
  tableName: string;
  index: IndexMetadata;
  partitionKeyValue: string;
  sortKeyValue?: string;
  pageSize: number;
  cursor?: DynamoCursor;
}

interface UpdateItemInputArgs {
  tableName: string;
  metadata: TableMetadata;
  originalItem: Record<string, unknown>;
  updatedItem: Record<string, unknown>;
}

interface DynamoPageResponse {
  Items?: Record<string, AttributeValue>[];
  LastEvaluatedKey?: Record<string, AttributeValue>;
}

export class DynamoService {
  public async listTables(
    connection: ConnectionSelection,
  ): Promise<TableSummary[]> {
    const client = createDynamoDbClient(connection);
    const tableNames: string[] = [];
    let lastEvaluatedTableName: string | undefined;

    do {
      const response = await client.send(
        new ListTablesCommand({
          ExclusiveStartTableName: lastEvaluatedTableName,
        }),
      );
      tableNames.push(...(response.TableNames ?? []));
      lastEvaluatedTableName = response.LastEvaluatedTableName;
    } while (lastEvaluatedTableName);

    return tableNames
      .sort((left, right) => left.localeCompare(right))
      .map((name) => ({ name }));
  }

  public async describeTable(
    connection: ConnectionSelection,
    tableName: string,
  ): Promise<TableMetadata> {
    const client = createDynamoDbClient(connection);
    const response = await client.send(
      new DescribeTableCommand({
        TableName: tableName,
      }),
    );

    return mapTableMetadata(response);
  }

  public async scanTable(
    connection: ConnectionSelection,
    tableName: string,
    pageSize: number,
    cursor?: DynamoCursor,
  ): Promise<ResultPage> {
    const client = createDynamoDbClient(connection);
    return collectResultPage(
      pageSize,
      (limit, pageCursor) =>
        client.send(
          new ScanCommand({
            TableName: tableName,
            Limit: limit,
            ExclusiveStartKey: pageCursor,
          }),
        ),
      cursor,
    );
  }

  public async queryIndex(
    connection: ConnectionSelection,
    input: QueryIndexInputArgs,
  ): Promise<ResultPage> {
    const client = createDynamoDbClient(connection);
    const response = await client.send(
      new QueryCommand(buildIndexQueryInput(input)),
    );

    return {
      items: unmarshallItems(response.Items),
      lastEvaluatedKey: response.LastEvaluatedKey,
    };
  }

  public async updateItem(
    connection: ConnectionSelection,
    input: UpdateItemInputArgs,
  ): Promise<Record<string, unknown>> {
    const client = createDynamoDbClient(connection);
    const changedPrimaryKeys = getChangedPrimaryKeys(
      input.metadata,
      input.originalItem,
      input.updatedItem,
    );

    if (changedPrimaryKeys.length > 0) {
      await client.send(
        new TransactWriteItemsCommand(buildReplaceItemTransactionInput(input)),
      );

      return input.updatedItem;
    }

    const response = await client.send(
      new UpdateItemCommand(buildUpdateItemInput(input)),
    );

    return response.Attributes
      ? (unmarshall(response.Attributes) as Record<string, unknown>)
      : input.updatedItem;
  }
}

export function buildIndexQueryInput({
  tableName,
  index,
  partitionKeyValue,
  sortKeyValue,
  pageSize,
  cursor,
}: QueryIndexInputArgs): QueryCommandInput {
  const expressionAttributeNames: Record<string, string> = {
    "#pk": index.partitionKey.name,
  };
  const expressionAttributeValues: Record<string, AttributeValue> = {
    ":pk": toAttributeValue(index.partitionKey.type, partitionKeyValue),
  };

  let keyConditionExpression = "#pk = :pk";
  if (index.sortKey && sortKeyValue) {
    expressionAttributeNames["#sk"] = index.sortKey.name;
    expressionAttributeValues[":sk"] = toAttributeValue(
      index.sortKey.type,
      sortKeyValue,
    );
    keyConditionExpression += " AND #sk = :sk";
  }

  return {
    TableName: tableName,
    IndexName: index.name,
    KeyConditionExpression: keyConditionExpression,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    Limit: pageSize,
    ExclusiveStartKey: cursor,
  };
}

export function toAttributeValue(
  keyType: ScalarKeyType,
  value: string,
): AttributeValue {
  const trimmedValue = value.trim();

  switch (keyType) {
    case "S":
      return { S: trimmedValue };
    case "N":
      if (!/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/u.test(trimmedValue)) {
        throw new Error(`"${value}" is not a valid numeric key value.`);
      }
      return { N: trimmedValue };
    case "B":
      return { B: new TextEncoder().encode(trimmedValue) };
  }
}

export function unmarshallItems(
  items: Record<string, AttributeValue>[] | undefined,
): Record<string, unknown>[] {
  return (items ?? []).map(
    (item) => unmarshall(item) as Record<string, unknown>,
  );
}

export async function collectResultPage(
  pageSize: number,
  loadPage: (
    limit: number,
    cursor?: DynamoCursor,
  ) => Promise<DynamoPageResponse>,
  cursor?: DynamoCursor,
): Promise<ResultPage> {
  const items: Record<string, unknown>[] = [];
  let nextCursor = cursor;

  while (items.length < pageSize) {
    const response = await loadPage(pageSize - items.length, nextCursor);
    const pageItems = unmarshallItems(response.Items);

    items.push(...pageItems);
    nextCursor = response.LastEvaluatedKey;

    if (!nextCursor || pageItems.length === 0) {
      break;
    }
  }

  return {
    items,
    lastEvaluatedKey: nextCursor,
  };
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected DynamoDB error.";
}

export function buildItemKey(
  metadata: TableMetadata,
  item: Record<string, unknown>,
): Record<string, AttributeValue> {
  return marshall(buildPrimaryKeyRecord(metadata, item));
}

export function buildUpdateItemInput({
  tableName,
  metadata,
  originalItem,
  updatedItem,
}: UpdateItemInputArgs): UpdateItemCommandInput {
  const changedPrimaryKeys = getChangedPrimaryKeys(
    metadata,
    originalItem,
    updatedItem,
  );
  if (changedPrimaryKeys.length > 0) {
    throw new Error(
      `Primary key attribute "${changedPrimaryKeys[0].name}" cannot be edited.`,
    );
  }

  const changedAttributes = Object.keys(originalItem).filter(
    (attributeName) => {
      if (isPrimaryKeyAttribute(attributeName, metadata)) {
        return false;
      }

      if (!(attributeName in updatedItem)) {
        return false;
      }

      return !areValuesEqual(
        originalItem[attributeName],
        updatedItem[attributeName],
      );
    },
  );

  if (changedAttributes.length === 0) {
    throw new Error("No editable changes to save.");
  }

  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, AttributeValue> = {};
  const setExpressions = changedAttributes.map((attributeName, index) => {
    const nameKey = `#attr${index}`;
    const valueKey = `:value${index}`;

    expressionAttributeNames[nameKey] = attributeName;
    expressionAttributeValues[valueKey] = toDocumentAttributeValue(
      updatedItem[attributeName],
    );

    return `${nameKey} = ${valueKey}`;
  });

  return {
    TableName: tableName,
    Key: buildItemKey(metadata, originalItem),
    UpdateExpression: `SET ${setExpressions.join(", ")}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: "ALL_NEW",
  };
}

export function buildReplaceItemTransactionInput({
  tableName,
  metadata,
  originalItem,
  updatedItem,
}: UpdateItemInputArgs): TransactWriteItemsCommandInput {
  const changedPrimaryKeys = getChangedPrimaryKeys(
    metadata,
    originalItem,
    updatedItem,
  );
  const changedPartitionKey = changedPrimaryKeys.find(
    (key) => key.name === metadata.partitionKey.name,
  );
  if (changedPartitionKey) {
    throw new Error(
      `Primary key attribute "${changedPartitionKey.name}" cannot be edited.`,
    );
  }

  if (
    !metadata.sortKey ||
    changedPrimaryKeys.length !== 1 ||
    changedPrimaryKeys[0].name !== metadata.sortKey.name
  ) {
    throw new Error("Sort key changes are required to replace an item.");
  }

  return {
    TransactItems: [
      {
        Put: {
          TableName: tableName,
          Item: marshall(updatedItem),
        },
      },
      {
        Delete: {
          TableName: tableName,
          Key: buildItemKey(metadata, originalItem),
        },
      },
    ],
  };
}

function mapTableMetadata(response: DescribeTableCommandOutput): TableMetadata {
  const table = response.Table;
  if (!table?.TableName || !table.KeySchema || !table.AttributeDefinitions) {
    throw new Error("DynamoDB returned incomplete table metadata.");
  }

  const attributeTypes = new Map<string, ScalarKeyType>(
    table.AttributeDefinitions.flatMap((definition) => {
      if (!definition.AttributeName || !definition.AttributeType) {
        return [];
      }

      return [
        [definition.AttributeName, definition.AttributeType as ScalarKeyType],
      ];
    }),
  );

  return {
    tableName: table.TableName,
    partitionKey: requireKeyMetadata(
      readKeyMetadata(table.KeySchema, attributeTypes, "HASH"),
      "table partition key",
    ),
    sortKey: readKeyMetadata(table.KeySchema, attributeTypes, "RANGE"),
    globalSecondaryIndexes: (table.GlobalSecondaryIndexes ?? []).flatMap(
      (index) => {
        if (!index.IndexName || !index.KeySchema) {
          return [];
        }

        return [
          {
            name: index.IndexName,
            partitionKey: requireKeyMetadata(
              readKeyMetadata(index.KeySchema, attributeTypes, "HASH"),
              `index partition key for ${index.IndexName}`,
            ),
            sortKey: readKeyMetadata(index.KeySchema, attributeTypes, "RANGE"),
          },
        ];
      },
    ),
  };
}

function toDocumentAttributeValue(value: unknown): AttributeValue {
  return marshall({ value }).value as AttributeValue;
}

function isPrimaryKeyAttribute(
  attributeName: string,
  metadata: TableMetadata,
): boolean {
  return getPrimaryKeys(metadata).some((key) => key.name === attributeName);
}

function getChangedPrimaryKeys(
  metadata: TableMetadata,
  originalItem: Record<string, unknown>,
  updatedItem: Record<string, unknown>,
): KeyMetadata[] {
  return getPrimaryKeys(metadata).filter((key) => {
    const originalValue = requireItemValue(originalItem, key.name);
    const updatedValue = requireItemValue(updatedItem, key.name);
    return !areKeyValuesEqual(key.type, originalValue, updatedValue);
  });
}

function requireItemValue(
  item: Record<string, unknown>,
  attributeName: string,
): unknown {
  if (!(attributeName in item)) {
    throw new Error(`Missing required item attribute "${attributeName}".`);
  }

  return item[attributeName];
}

function areKeyValuesEqual(
  keyType: ScalarKeyType,
  left: unknown,
  right: unknown,
): boolean {
  if (keyType === "B") {
    return areBinaryValuesEqual(left, right);
  }

  return Object.is(left, right);
}

function areBinaryValuesEqual(left: unknown, right: unknown): boolean {
  if (!(left instanceof Uint8Array) || !(right instanceof Uint8Array)) {
    return false;
  }

  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function readKeyMetadata(
  keySchema:
    | NonNullable<DescribeTableCommandOutput["Table"]>["KeySchema"]
    | undefined,
  attributeTypes: Map<string, ScalarKeyType>,
  keyType: "HASH" | "RANGE",
): KeyMetadata | undefined {
  if (!keySchema) {
    return undefined;
  }

  const schema = keySchema.find((entry) => entry.KeyType === keyType);
  if (!schema?.AttributeName) {
    return undefined;
  }

  const attributeType = attributeTypes.get(schema.AttributeName);
  if (!attributeType) {
    throw new Error(
      `Missing attribute type for key "${schema.AttributeName}".`,
    );
  }

  return {
    name: schema.AttributeName,
    type: attributeType,
  };
}

function requireKeyMetadata(
  metadata: KeyMetadata | undefined,
  label: string,
): KeyMetadata {
  if (!metadata) {
    throw new Error(`Missing ${label} in DynamoDB metadata.`);
  }

  return metadata;
}
