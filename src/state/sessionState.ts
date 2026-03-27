import * as vscode from "vscode";

import { loadAwsProfiles, resolveRegionForProfile } from "../aws/profiles";
import type {
  AwsProfileInfo,
  ConnectionSelection,
  TableSummary,
} from "../types";

const ACTIVE_PROFILE_KEY = "dynamodb.activeProfile";
const ACTIVE_REGIONS_KEY = "dynamodb.activeRegionByProfile";
const FAVORITE_TABLES_KEY = "dynamodb.favoriteTablesByConnection";

export function selectInitialProfile(
  profiles: AwsProfileInfo[],
  persistedProfileName: string | undefined,
): AwsProfileInfo | undefined {
  return (
    profiles.find((profile) => profile.name === persistedProfileName) ??
    profiles.find((profile) => profile.name === "default") ??
    profiles[0]
  );
}

export class SessionState {
  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  private profiles: AwsProfileInfo[] = [];
  private tables: TableSummary[] = [];
  private connection: ConnectionSelection | undefined;

  public readonly onDidChange = this.onDidChangeEmitter.event;

  public constructor(
    private readonly globalState: vscode.Memento,
    private readonly getConfiguredDefaultRegion: () => string,
    private readonly loadProfiles: () => Promise<
      AwsProfileInfo[]
    > = loadAwsProfiles,
  ) {}

  public async initialize(): Promise<void> {
    await this.reloadProfiles();
  }

  public async reloadProfiles(): Promise<AwsProfileInfo[]> {
    this.profiles = await this.loadProfiles();
    const persistedProfile = this.globalState.get<string>(ACTIVE_PROFILE_KEY);
    const nextProfile = selectInitialProfile(this.profiles, persistedProfile);
    if (!nextProfile) {
      this.clearConnectionState();
      return this.profiles;
    }

    await this.setActiveProfile(nextProfile.name, false);

    return this.profiles;
  }

  public getProfiles(): AwsProfileInfo[] {
    return this.profiles;
  }

  public getTables(): TableSummary[] {
    return this.tables;
  }

  public getFavoriteTables(): string[] {
    const connection = this.connection;
    if (!connection) {
      return [];
    }

    return [
      ...(this.getPersistedFavoriteTables()[getConnectionKey(connection)] ??
        []),
    ];
  }

  public isFavoriteTable(tableName: string): boolean {
    return this.getFavoriteTables().includes(tableName);
  }

  public setTables(tables: TableSummary[]): void {
    this.tables = tables;
    this.onDidChangeEmitter.fire();
  }

  public clearTables(): void {
    this.tables = [];
    this.onDidChangeEmitter.fire();
  }

  public async setFavoriteTable(
    tableName: string,
    isFavorite: boolean,
  ): Promise<boolean> {
    const connection = this.connection;
    if (!connection) {
      return false;
    }

    const persistedFavorites = this.getPersistedFavoriteTables();
    const connectionKey = getConnectionKey(connection);
    const favoriteTables = new Set(persistedFavorites[connectionKey] ?? []);

    if (isFavorite) {
      favoriteTables.add(tableName);
    } else {
      favoriteTables.delete(tableName);
    }

    persistedFavorites[connectionKey] = [...favoriteTables].sort(
      (left, right) => left.localeCompare(right),
    );
    await this.globalState.update(FAVORITE_TABLES_KEY, persistedFavorites);
    this.onDidChangeEmitter.fire();

    return isFavorite;
  }

  public getConnection(): ConnectionSelection | undefined {
    return this.connection;
  }

  public async setActiveProfile(
    profileName: string,
    fireEvent = true,
  ): Promise<ConnectionSelection | undefined> {
    const profile = this.profiles.find((entry) => entry.name === profileName);
    if (!profile) {
      return this.connection;
    }

    const persistedRegions =
      this.globalState.get<Record<string, string>>(ACTIVE_REGIONS_KEY) ?? {};

    this.connection = {
      profile: profile.name,
      region: resolveRegionForProfile(
        profile,
        persistedRegions[profile.name],
        this.getConfiguredDefaultRegion(),
      ),
    };

    await this.globalState.update(ACTIVE_PROFILE_KEY, profile.name);
    await this.persistRegion(this.connection.profile, this.connection.region);

    if (fireEvent) {
      this.tables = [];
      this.onDidChangeEmitter.fire();
    }

    return this.connection;
  }

  public async setActiveRegion(
    region: string,
  ): Promise<ConnectionSelection | undefined> {
    if (!this.connection) {
      return undefined;
    }

    this.connection = {
      ...this.connection,
      region,
    };

    await this.persistRegion(this.connection.profile, region);
    this.tables = [];
    this.onDidChangeEmitter.fire();

    return this.connection;
  }

  private async persistRegion(
    profileName: string,
    region: string,
  ): Promise<void> {
    const persistedRegions =
      this.globalState.get<Record<string, string>>(ACTIVE_REGIONS_KEY) ?? {};

    persistedRegions[profileName] = region;
    await this.globalState.update(ACTIVE_REGIONS_KEY, persistedRegions);
  }

  private clearConnectionState(): void {
    this.connection = undefined;
    this.tables = [];
    this.onDidChangeEmitter.fire();
  }

  private getPersistedFavoriteTables(): Record<string, string[]> {
    return (
      this.globalState.get<Record<string, string[]>>(FAVORITE_TABLES_KEY) ?? {}
    );
  }
}

function getConnectionKey(connection: ConnectionSelection): string {
  return `${connection.profile}:${connection.region}`;
}
