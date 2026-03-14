import * as os from "node:os";
import * as path from "node:path";
import { readFile } from "node:fs/promises";

import type { AwsProfileInfo } from "../types";

interface IniSection {
  name: string;
  values: Record<string, string>;
}

const AWS_CONFIG_PATH = path.join(os.homedir(), ".aws", "config");
const AWS_CREDENTIALS_PATH = path.join(os.homedir(), ".aws", "credentials");

export const KNOWN_DYNAMODB_REGIONS = [
  "af-south-1",
  "ap-east-1",
  "ap-east-2",
  "ap-northeast-1",
  "ap-northeast-2",
  "ap-northeast-3",
  "ap-south-1",
  "ap-south-2",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-southeast-3",
  "ap-southeast-4",
  "ap-southeast-5",
  "ap-southeast-7",
  "ca-central-1",
  "ca-west-1",
  "eu-central-1",
  "eu-central-2",
  "eu-north-1",
  "eu-south-1",
  "eu-south-2",
  "eu-west-1",
  "eu-west-2",
  "eu-west-3",
  "il-central-1",
  "me-central-1",
  "me-south-1",
  "mx-central-1",
  "sa-east-1",
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
] as const;

export function parseIniSections(content: string): IniSection[] {
  const sections: IniSection[] = [];
  let current: IniSection | undefined;

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) {
      continue;
    }

    if (line.startsWith("[") && line.endsWith("]")) {
      current = {
        name: line.slice(1, -1).trim(),
        values: {},
      };
      sections.push(current);
      continue;
    }

    if (!current) {
      continue;
    }

    const separatorIndex = line.search(/\s*=\s*|\s*:\s*/u);
    if (separatorIndex === -1) {
      continue;
    }

    const [key, rawValue] = line.split(/\s*=\s*|\s*:\s*/u, 2);
    if (!key || rawValue === undefined) {
      continue;
    }

    current.values[key.trim()] = rawValue.trim();
  }

  return sections;
}

export function readProfilesFromContents(
  configContent: string,
  credentialsContent: string,
): AwsProfileInfo[] {
  const byName = new Map<string, AwsProfileInfo>();

  for (const section of parseIniSections(configContent)) {
    const profileName = normalizeConfigSectionName(section.name);
    if (!profileName) {
      continue;
    }

    byName.set(profileName, {
      name: profileName,
      defaultRegion: section.values.region,
    });
  }

  for (const section of parseIniSections(credentialsContent)) {
    const profileName = section.name.trim();
    if (!profileName) {
      continue;
    }

    byName.set(profileName, {
      name: profileName,
      defaultRegion: byName.get(profileName)?.defaultRegion,
    });
  }

  return [...byName.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

export async function loadAwsProfiles(): Promise<AwsProfileInfo[]> {
  const [configContent, credentialsContent] = await Promise.all([
    readOptionalFile(AWS_CONFIG_PATH),
    readOptionalFile(AWS_CREDENTIALS_PATH),
  ]);

  return readProfilesFromContents(configContent, credentialsContent);
}

export function resolveRegionForProfile(
  profile: AwsProfileInfo,
  persistedRegion: string | undefined,
  configuredDefaultRegion: string | undefined,
): string {
  return (
    persistedRegion ||
    profile.defaultRegion ||
    configuredDefaultRegion ||
    "us-east-1"
  );
}

async function readOptionalFile(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return "";
    }

    throw error;
  }
}

function normalizeConfigSectionName(sectionName: string): string | undefined {
  const trimmed = sectionName.trim();
  if (trimmed === "default") {
    return trimmed;
  }

  if (trimmed.startsWith("profile ")) {
    return trimmed.slice("profile ".length).trim();
  }

  return undefined;
}
