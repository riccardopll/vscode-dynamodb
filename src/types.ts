import type { AttributeValue } from "@aws-sdk/client-dynamodb";

export type ScalarKeyType = "S" | "N" | "B";
export type DynamoCursor = Record<string, AttributeValue> | undefined;

export interface AwsProfileInfo {
  name: string;
  defaultRegion?: string;
}

export interface ConnectionSelection {
  profile: string;
  region: string;
}

export interface TableSummary {
  name: string;
}

export interface KeyMetadata {
  name: string;
  type: ScalarKeyType;
}

export interface IndexMetadata {
  name: string;
  partitionKey: KeyMetadata;
  sortKey?: KeyMetadata;
}

export interface TableMetadata {
  tableName: string;
  partitionKey: KeyMetadata;
  sortKey?: KeyMetadata;
  globalSecondaryIndexes: IndexMetadata[];
}

export type ExplorerMode = "scan" | "query";

export interface ResultPage {
  items: Record<string, unknown>[];
  lastEvaluatedKey?: Record<string, AttributeValue>;
}
