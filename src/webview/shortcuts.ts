interface ParsedShortcut {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export function parseShortcut(shortcut: string): ParsedShortcut | undefined {
  const normalized = shortcut.trim();
  if (!normalized) {
    return undefined;
  }

  const parts = normalized
    .split("+")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

  if (parts.length === 0) {
    return undefined;
  }

  const parsed: ParsedShortcut = {
    key: "",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
  };

  for (const part of parts) {
    switch (part) {
      case "mod":
        parsed.metaKey = true;
        parsed.ctrlKey = true;
        break;
      case "cmd":
      case "meta":
      case "command":
        parsed.metaKey = true;
        break;
      case "ctrl":
      case "control":
        parsed.ctrlKey = true;
        break;
      case "alt":
      case "option":
        parsed.altKey = true;
        break;
      case "shift":
        parsed.shiftKey = true;
        break;
      default:
        if (parsed.key) {
          return undefined;
        }
        parsed.key = part;
    }
  }

  return parsed.key ? parsed : undefined;
}

export function matchesShortcut(
  event: KeyboardEvent,
  shortcut: string,
): boolean {
  const parsed = parseShortcut(shortcut);
  if (!parsed) {
    return false;
  }

  const key = event.key.toLowerCase();
  const metaOrCtrlMatches =
    parsed.metaKey && parsed.ctrlKey
      ? event.metaKey || event.ctrlKey
      : event.metaKey === parsed.metaKey && event.ctrlKey === parsed.ctrlKey;

  return (
    metaOrCtrlMatches &&
    event.altKey === parsed.altKey &&
    event.shiftKey === parsed.shiftKey &&
    key === parsed.key
  );
}
