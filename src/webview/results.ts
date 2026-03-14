export function collectResultColumns(
  rows: Record<string, unknown>[],
): string[] {
  const keys = new Set<string>();

  for (const row of rows) {
    Object.keys(row).forEach((key) => keys.add(key));
  }

  return [...keys].sort((left, right) => left.localeCompare(right));
}
