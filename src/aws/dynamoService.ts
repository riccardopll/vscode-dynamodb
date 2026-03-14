import {
  DescribeTableCommand,
  ListTablesCommand,
  QueryCommand,
  type QueryCommandInput,
  ScanCommand,
  type AttributeValue,
  type DescribeTableCommandOutput,
} from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";

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
import { createDynamoDbClient } from "./dynamoClient";

interface QueryIndexInputArgs {
  tableName: string;
  index: IndexMetadata;
  partitionKeyValue: string;
  sortKeyValue?: string;
  pageSize: number;
  cursor?: DynamoCursor;
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
    const response = await client.send(
      new ScanCommand({
        TableName: tableName,
        Limit: pageSize,
        ExclusiveStartKey: cursor,
      }),
    );

    return {
      items: unmarshallItems(response.Items),
      lastEvaluatedKey: response.LastEvaluatedKey,
    };
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

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected DynamoDB error.";
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
