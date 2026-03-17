import type { DynamoCursor, ExplorerMode, TableMetadata } from "../types";

export interface ExplorerBootstrap {
  profile: string;
  region: string;
  pageSize: number;
  metadata: TableMetadata;
}

export type WebviewToExtensionMessage =
  | {
      type: "runScan";
      cursor?: DynamoCursor;
    }
  | {
      type: "runQuery";
      indexName: string;
      partitionKeyValue: string;
      sortKeyValue?: string;
      cursor?: DynamoCursor;
    }
  | {
      type: "copyItem";
      item: Record<string, unknown>;
    }
  | {
      type: "saveItems";
      items: {
        originalItem: Record<string, unknown>;
        updatedItem: Record<string, unknown>;
      }[];
    };

export type ExtensionToWebviewMessage =
  | {
      type: "setLoading";
      loading: boolean;
    }
  | {
      type: "saveRequested";
    }
  | {
      type: "results";
      mode: ExplorerMode;
      append: boolean;
      items: Record<string, unknown>[];
      cursor?: DynamoCursor;
    }
  | {
      type: "error";
      message: string;
    }
  | {
      type: "itemsSaved";
      items: {
        originalItem: Record<string, unknown>;
        item: Record<string, unknown>;
      }[];
    };
