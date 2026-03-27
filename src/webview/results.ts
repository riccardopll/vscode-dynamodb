import type { TableMetadata } from "../types";
import { formatCell } from "./editing";

const MAX_COLUMN_WIDTH_CH = 48;

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

export function collectColumnMinWidths(
  columns: string[],
  rows: Record<string, unknown>[],
  metadata?: Pick<TableMetadata, "partitionKey" | "sortKey">,
): Record<string, string> {
  return Object.fromEntries(
    columns.map((column) => {
      const contentLength = rows.reduce((maxWidth, row) => {
        return Math.max(maxWidth, formatCell(row[column]).length);
      }, 0);

      const width = Math.min(
        Math.max(getColumnHeaderWidth(column, metadata), contentLength),
        MAX_COLUMN_WIDTH_CH,
      );

      return [column, `${width}ch`];
    }),
  );
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

function getColumnHeaderWidth(
  column: string,
  metadata?: Pick<TableMetadata, "partitionKey" | "sortKey">,
): number {
  const roleWidth =
    column === metadata?.partitionKey.name || column === metadata?.sortKey?.name
      ? 3
      : 0;

  return column.length + roleWidth;
}
