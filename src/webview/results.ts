export function collectResultColumns(
  rows: Record<string, unknown>[],
  primaryKeyName?: string,
): string[] {
  const keys = new Set<string>();

  for (const row of rows) {
    Object.keys(row).forEach((key) => keys.add(key));
  }

  const columns = [...keys].sort((left, right) => left.localeCompare(right));
  if (!primaryKeyName) {
    return columns;
  }

  return columns.sort((left, right) => {
    if (left === primaryKeyName) {
      return -1;
    }

    if (right === primaryKeyName) {
      return 1;
    }

    return left.localeCompare(right);
  });
}
