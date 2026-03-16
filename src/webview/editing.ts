import type { TableMetadata } from "../types";

interface ParseEditedValueSuccess {
  ok: true;
  value: unknown;
}

interface ParseEditedValueFailure {
  ok: false;
  message: string;
}

export type ParseEditedValueResult =
  | ParseEditedValueSuccess
  | ParseEditedValueFailure;

export function getRowKey(
  item: Record<string, unknown>,
  metadata: TableMetadata,
): string {
  const keyValue: Record<string, unknown> = {
    [metadata.partitionKey.name]: toStableJsonValue(
      item[metadata.partitionKey.name],
    ),
  };

  if (metadata.sortKey) {
    keyValue[metadata.sortKey.name] = toStableJsonValue(
      item[metadata.sortKey.name],
    );
  }

  return JSON.stringify(keyValue);
}

export function isKeyColumn(column: string, metadata: TableMetadata): boolean {
  return column === metadata.partitionKey.name;
}

export function hasOwnColumn(
  item: Record<string, unknown>,
  column: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(item, column);
}

export function formatCell(value: unknown): string {
  if (value === undefined) {
    return "";
  }

  if (value === null) {
    return "null";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

export function formatEditableValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value === undefined) {
    return "";
  }

  return JSON.stringify(value, null, isStructuredValue(value) ? 2 : 0);
}

export function isStructuredValue(value: unknown): boolean {
  return Array.isArray(value) || (typeof value === "object" && value !== null);
}

export function parseEditedValue(
  originalValue: unknown,
  draftText: string,
): ParseEditedValueResult {
  if (typeof originalValue === "string") {
    return {
      ok: true,
      value: draftText,
    };
  }

  const parsed = tryParseJson(draftText);
  if (!parsed.ok) {
    return parsed;
  }

  if (typeof originalValue === "number") {
    if (typeof parsed.value !== "number" || !Number.isFinite(parsed.value)) {
      return {
        ok: false,
        message: "Enter a valid JSON number.",
      };
    }
  }

  if (typeof originalValue === "boolean" && typeof parsed.value !== "boolean") {
    return {
      ok: false,
      message: "Enter true or false.",
    };
  }

  if (originalValue === null && parsed.value !== null) {
    return {
      ok: false,
      message: "Enter null.",
    };
  }

  if (Array.isArray(originalValue) && !Array.isArray(parsed.value)) {
    return {
      ok: false,
      message: "Enter a JSON array.",
    };
  }

  if (
    isPlainObject(originalValue) &&
    (!isPlainObject(parsed.value) || Array.isArray(parsed.value))
  ) {
    return {
      ok: false,
      message: "Enter a JSON object.",
    };
  }

  return parsed;
}

export function getDirtyColumns(
  originalItem: Record<string, unknown>,
  editedItem: Record<string, unknown>,
  metadata: TableMetadata,
): string[] {
  return Object.keys(originalItem).filter((column) => {
    if (isKeyColumn(column, metadata)) {
      return false;
    }

    if (!(column in editedItem)) {
      return false;
    }

    return !areValuesEqual(originalItem[column], editedItem[column]);
  });
}

export function getCellKey(rowKey: string, column: string): string {
  return `${rowKey}:${column}`;
}

function tryParseJson(draftText: string): ParseEditedValueResult {
  try {
    return {
      ok: true,
      value: JSON.parse(draftText),
    };
  } catch {
    return {
      ok: false,
      message: "Enter a valid JSON value.",
    };
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStableJsonValue(value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return Array.from(value);
  }

  return value;
}

function areValuesEqual(left: unknown, right: unknown): boolean {
  if (left instanceof Uint8Array || right instanceof Uint8Array) {
    return areBinaryValuesEqual(left, right);
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      return false;
    }

    if (left.length !== right.length) {
      return false;
    }

    return left.every((value, index) => areValuesEqual(value, right[index]));
  }

  if (isPlainObject(left) || isPlainObject(right)) {
    if (!isPlainObject(left) || !isPlainObject(right)) {
      return false;
    }

    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) {
      return false;
    }

    return leftKeys.every(
      (key) => key in right && areValuesEqual(left[key], right[key]),
    );
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
