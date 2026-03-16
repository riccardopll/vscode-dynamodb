import type { TableMetadata } from "../types";

export function collectResultColumns(
  rows: Record<string, unknown>[],
  metadata?: Pick<TableMetadata, "partitionKey" | "sortKey">,
): string[] {
  const keys = new Set<string>();

  for (const row of rows) {
    Object.keys(row).forEach((key) => keys.add(key));
  }

  return [...keys].sort((left, right) => {
    const leftRank = getColumnRank(left, metadata);
    const rightRank = getColumnRank(right, metadata);

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return left.localeCompare(right);
  });
}

function getColumnRank(
  column: string,
  metadata?: Pick<TableMetadata, "partitionKey" | "sortKey">,
): number {
  if (column === metadata?.partitionKey.name) {
    return 0;
  }

  if (column === metadata?.sortKey?.name) {
    return 1;
  }

  return 2;
}
