export function collectResultColumns(
  rows: Record<string, unknown>[],
  primaryKeyName?: string,
): string[] {
  const keys = new Set<string>();

  for (const row of rows) {
    Object.keys(row).forEach((key) => keys.add(key));
  }

  return [...keys].sort((left, right) => {
    if (!primaryKeyName) {
      return left.localeCompare(right);
    }

    if (left === primaryKeyName) {
      return -1;
    }

    if (right === primaryKeyName) {
      return 1;
    }

    return left.localeCompare(right);
  });
}
