<script lang="ts">
  import { onMount } from "svelte";

  import type { DynamoCursor, ExplorerMode } from "../types";
  import ResultsTable from "./components/ResultsTable.svelte";
  import {
    formatEditableValue,
    getCellKey,
    getDirtyColumns,
    getRowKey,
    parseEditedValue,
  } from "./editing";
  import type {
    ExplorerBootstrap,
    ExtensionToWebviewMessage,
    WebviewToExtensionMessage,
  } from "./protocol";
  import { collectResultColumns } from "./results";
  interface ResultPage {
    items: Record<string, unknown>[];
    nextCursor?: DynamoCursor;
  }

  interface QueryRequestScan {
    type: "runScan";
  }

  interface QueryRequestIndex {
    type: "runQuery";
    indexName: string;
    partitionKeyValue: string;
    sortKeyValue?: string;
  }

  interface UpdateCellDraftDetail {
    item: Record<string, unknown>;
    column: string;
    value: string;
  }

  type QueryRequest = QueryRequestScan | QueryRequestIndex;
  type BusyAction = "query" | "save" | undefined;

  interface VsCodeApi {
    postMessage(message: WebviewToExtensionMessage): void;
  }

  export let bootstrap: ExplorerBootstrap;
  export let vscode: VsCodeApi;

  let mode: ExplorerMode = "scan";
  let selectedIndexName = bootstrap.metadata.globalSecondaryIndexes[0]?.name ?? "";
  let partitionKeyValue = "";
  let sortKeyValue = "";
  let pages: ResultPage[] = [];
  let currentPageIndex = 0;
  let loading = false;
  let busyAction: BusyAction;
  let requestError = "";
  let lastQuery: QueryRequest | undefined;
  let pendingPageIndex: number | undefined;
  let originalRowsByKey: Record<string, Record<string, unknown>> = {};
  let editedRowsByKey: Record<string, Record<string, unknown>> = {};
  let dirtyColumnsByRowKey: Record<string, string[]> = {};
  let cellDrafts: Record<string, string> = {};
  let invalidCells: Record<string, string> = {};
  let savedMessageVisible = false;
  let savedMessageTimer: ReturnType<typeof setTimeout> | undefined;

  $: queryIndexes = bootstrap.metadata.globalSecondaryIndexes;
  $: selectedIndex = queryIndexes.find(
    (index) => index.name === selectedIndexName,
  );
  $: currentPage = pages[currentPageIndex];
  $: items = currentPage?.items ?? [];
  $: columns = collectResultColumns(
    items,
    bootstrap.metadata,
  );
  $: hasResults = items.length > 0;
  $: canRunQuery = Boolean(selectedIndex) && !loading;
  $: canGoPrevious = !loading && currentPageIndex > 0;
  $: canGoNext =
    !loading &&
    Boolean(
      (currentPageIndex < pages.length - 1) || currentPage?.nextCursor,
    );
  $: currentPageNumber = currentPageIndex + 1;
  $: dirtyRowKeys = Object.keys(dirtyColumnsByRowKey);
  $: invalidCellKeys = Object.keys(invalidCells);
  $: dirtyCellCount = dirtyRowKeys.reduce(
    (count, rowKey) => count + dirtyColumnsByRowKey[rowKey].length,
    0,
  );
  $: hasPendingEdits = dirtyRowKeys.length > 0 || invalidCellKeys.length > 0;
  $: canSave =
    !loading && dirtyRowKeys.length > 0 && invalidCellKeys.length === 0;
  $: busyLabel =
    busyAction === "save" && loading ? "Saving..." : loading ? "Running..." : "";
  $: validationError = invalidCellKeys.length > 0 ? invalidCells[invalidCellKeys[0]] : "";
  $: error = validationError || requestError;

  onMount(() => {
    const handleMessage = (
      event: MessageEvent<ExtensionToWebviewMessage>,
    ): void => {
      const message = event.data;

      switch (message.type) {
        case "setLoading":
          loading = message.loading;
          if (!message.loading) {
            busyAction = undefined;
          }
          return;
        case "error":
          pendingPageIndex = undefined;
          requestError = message.message;
          return;
        case "results":
          if (message.append) {
            const nextPageIndex = pendingPageIndex ?? pages.length;
            pages = [
              ...pages.slice(0, nextPageIndex),
              {
                items: message.items,
                nextCursor: message.cursor,
              },
            ];
            currentPageIndex = nextPageIndex;
          } else {
            pages = [
              {
                items: message.items,
                nextCursor: message.cursor,
              },
            ];
            currentPageIndex = 0;
          }

          pendingPageIndex = undefined;
          clearEditingState();
          return;
        case "itemsSaved":
          for (const entry of message.items) {
            applySavedItem(
              entry.item,
              getRowKey(entry.originalItem, bootstrap.metadata),
            );
          }
          requestError = "";
          if (message.items.length > 0) {
            showSavedMessage();
          }
          return;
        case "saveRequested":
          saveChanges();
          return;
      }
    };

    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("message", handleMessage);
      clearSavedMessageTimer();
    };
  });

  function switchMode(nextMode: ExplorerMode): void {
    if (nextMode === "query-index" && queryIndexes.length === 0) {
      return;
    }

    if (!confirmDiscardPendingEdits()) {
      return;
    }

    mode = nextMode;
    resetResults();
  }

  function selectIndex(nextIndexName: string): void {
    if (nextIndexName === selectedIndexName) {
      return;
    }

    if (!confirmDiscardPendingEdits()) {
      return;
    }

    selectedIndexName = nextIndexName;
    partitionKeyValue = "";
    sortKeyValue = "";
    resetResults();
  }

  function updatePartitionKey(value: string): void {
    if (value === partitionKeyValue) {
      return;
    }

    if (!confirmDiscardPendingEdits()) {
      return;
    }

    partitionKeyValue = value;
    resetResults();
  }

  function updateSortKey(value: string): void {
    if (value === sortKeyValue) {
      return;
    }

    if (!confirmDiscardPendingEdits()) {
      return;
    }

    sortKeyValue = value;
    resetResults();
  }

  function runScan(): void {
    resetResults();
    lastQuery = { type: "runScan" };
    busyAction = "query";
    postMessage({ type: "runScan" });
  }

  function runQuery(): void {
    if (!selectedIndex) {
      requestError = "Select an index before running a query.";
      return;
    }

    if (!partitionKeyValue.trim()) {
      requestError = `${selectedIndex.partitionKey.name} is required.`;
      return;
    }

    resetResults();

    const nextQuery: QueryRequest = {
      type: "runQuery",
      indexName: selectedIndex.name,
      partitionKeyValue,
      sortKeyValue: sortKeyValue || undefined,
    };

    lastQuery = nextQuery;
    busyAction = "query";
    postMessage(nextQuery);
  }

  function runActiveRequest(): void {
    if (!confirmDiscardPendingEdits()) {
      return;
    }

    if (mode === "scan") {
      runScan();
      return;
    }

    runQuery();
  }

  function loadMore(): void {
    if (!lastQuery) {
      return;
    }

    if (!confirmDiscardPendingEdits()) {
      return;
    }

    if (currentPageIndex < pages.length - 1) {
      currentPageIndex += 1;
      return;
    }

    const cursor = currentPage?.nextCursor;
    if (!cursor) {
      return;
    }

    pendingPageIndex = currentPageIndex + 1;
    busyAction = "query";

    if (lastQuery.type === "runScan") {
      postMessage({
        type: "runScan",
        cursor,
      });
      return;
    }

    postMessage({
      type: "runQuery",
      indexName: lastQuery.indexName,
      partitionKeyValue: lastQuery.partitionKeyValue,
      sortKeyValue: lastQuery.sortKeyValue,
      cursor,
    });
  }

  function showPreviousPage(): void {
    if (currentPageIndex === 0 || loading) {
      return;
    }

    if (!confirmDiscardPendingEdits()) {
      return;
    }

    currentPageIndex -= 1;
  }

  function handleUpdateCellDraft(
    event: CustomEvent<UpdateCellDraftDetail>,
  ): void {
    const { item, column, value } = event.detail;
    const rowKey = getRowKey(item, bootstrap.metadata);
    const cellKey = getCellKey(rowKey, column);
    const originalRow = originalRowsByKey[rowKey] ?? structuredClone(item);
    const originalValue = originalRow[column];

    originalRowsByKey = {
      ...originalRowsByKey,
      [rowKey]: originalRow,
    };
    cellDrafts = {
      ...cellDrafts,
      [cellKey]: value,
    };
    requestError = "";
    clearSavedMessage();

    const result = parseEditedValue(originalValue, value);
    if (!result.ok) {
      invalidCells = {
        ...invalidCells,
        [cellKey]: result.message,
      };
      return;
    }

    invalidCells = omitKey(invalidCells, cellKey);

    const nextEditedRow = structuredClone(editedRowsByKey[rowKey] ?? originalRow);
    nextEditedRow[column] = result.value;

    const nextDirtyColumns = getDirtyColumns(
      originalRow,
      nextEditedRow,
      bootstrap.metadata,
    );

    if (nextDirtyColumns.length === 0) {
      editedRowsByKey = omitKey(editedRowsByKey, rowKey);
      dirtyColumnsByRowKey = omitKey(dirtyColumnsByRowKey, rowKey);
      cellDrafts = omitKey(cellDrafts, cellKey);
      return;
    }

    editedRowsByKey = {
      ...editedRowsByKey,
      [rowKey]: nextEditedRow,
    };
    dirtyColumnsByRowKey = {
      ...dirtyColumnsByRowKey,
      [rowKey]: nextDirtyColumns,
    };

    if (value === formatEditableValue(result.value)) {
      cellDrafts = omitKey(cellDrafts, cellKey);
    }
  }

  function saveChanges(): void {
    if (!canSave) {
      return;
    }

    requestError = "";
    busyAction = "save";
    clearSavedMessage();
    postMessage({
      type: "saveItems",
      items: dirtyRowKeys.map((rowKey) => ({
        originalItem: originalRowsByKey[rowKey],
        updatedItem: editedRowsByKey[rowKey],
      })),
    });
  }

  function confirmDiscardPendingEdits(): boolean {
    if (!hasPendingEdits) {
      return true;
    }

    const shouldDiscard = window.confirm("Discard unsaved changes?");
    if (!shouldDiscard) {
      return false;
    }

    clearEditingState();
    requestError = "";
    return true;
  }

  function applySavedItem(
    item: Record<string, unknown>,
    previousRowKey: string,
  ): void {
    const nextPageItems = items.map((candidate) =>
      getRowKey(candidate, bootstrap.metadata) === previousRowKey
        ? item
        : candidate,
    );

    pages = pages.map((page, index) =>
      index === currentPageIndex
        ? {
            ...page,
            items: nextPageItems,
          }
        : page,
    );

    clearRowEditingState(previousRowKey);
  }

  function clearRowEditingState(rowKey: string): void {
    originalRowsByKey = omitKey(originalRowsByKey, rowKey);
    editedRowsByKey = omitKey(editedRowsByKey, rowKey);
    dirtyColumnsByRowKey = omitKey(dirtyColumnsByRowKey, rowKey);
    cellDrafts = omitPrefixedKeys(cellDrafts, `${rowKey}:`);
    invalidCells = omitPrefixedKeys(invalidCells, `${rowKey}:`);
  }

  function clearEditingState(): void {
    originalRowsByKey = {};
    editedRowsByKey = {};
    dirtyColumnsByRowKey = {};
    cellDrafts = {};
    invalidCells = {};
    clearSavedMessage();
  }

  function resetResults(): void {
    pages = [];
    currentPageIndex = 0;
    pendingPageIndex = undefined;
    clearEditingState();
    requestError = "";
  }

  function postMessage(message: WebviewToExtensionMessage): void {
    vscode.postMessage(message);
  }

  function getEmptyMessage(): string {
    if (loading) {
      return "Loading rows...";
    }

    if (lastQuery) {
      return "No rows returned for this request.";
    }

    return "Run a scan or query to load rows.";
  }

  function omitKey<T extends Record<string, unknown>>(
    record: T,
    key: string,
  ): T {
    const { [key]: _removed, ...rest } = record;
    return rest as T;
  }

  function omitPrefixedKeys<T extends Record<string, unknown>>(
    record: T,
    prefix: string,
  ): T {
    return Object.fromEntries(
      Object.entries(record).filter(([key]) => !key.startsWith(prefix)),
    ) as T;
  }

  function showSavedMessage(): void {
    clearSavedMessageTimer();
    savedMessageVisible = true;
    savedMessageTimer = setTimeout(() => {
      savedMessageVisible = false;
      savedMessageTimer = undefined;
    }, 2000);
  }

  function clearSavedMessage(): void {
    clearSavedMessageTimer();
    savedMessageVisible = false;
  }

  function clearSavedMessageTimer(): void {
    if (!savedMessageTimer) {
      return;
    }

    clearTimeout(savedMessageTimer);
    savedMessageTimer = undefined;
  }
</script>

<svelte:head>
  <title>DynamoDB Explorer</title>
</svelte:head>

<div class="shell">
  <section class="controls-panel">
    <div class="controls-stack">
      <div class="primary-controls">
        <label class="field mode-field">
          <span>Mode</span>
          <select
            disabled={loading}
            on:change={(event) => switchMode(event.currentTarget.value as ExplorerMode)}
            value={mode}
          >
            <option value="scan">Scan table</option>
            <option disabled={queryIndexes.length === 0} value="query-index">Query GSI</option>
          </select>
        </label>

        <div class="actions">
          <button
            aria-label={mode === "scan" ? "Run Scan" : "Run Query"}
            class="run-button"
            disabled={loading || (mode === "query-index" && !canRunQuery)}
            on:click={runActiveRequest}
            type="button"
          >
            ▶
          </button>
        </div>
      </div>

      {#if mode === "query-index"}
        <div class="query-fields">
          <label class="field">
            <span>Index</span>
            <select
              disabled={loading || queryIndexes.length === 0}
              on:change={(event) => selectIndex(event.currentTarget.value)}
              value={selectedIndexName}
            >
              {#each queryIndexes as index (index.name)}
                <option value={index.name}>{index.name}</option>
              {/each}
            </select>
          </label>

          {#if selectedIndex}
            <label class="field">
              <span>{selectedIndex.partitionKey.name}</span>
              <input
                disabled={loading}
                on:input={(event) => updatePartitionKey(event.currentTarget.value)}
                placeholder={selectedIndex.partitionKey.type}
                value={partitionKeyValue}
              />
            </label>

            {#if selectedIndex.sortKey}
              <label class="field">
                <span>{selectedIndex.sortKey.name}</span>
                <input
                  disabled={loading}
                  on:input={(event) => updateSortKey(event.currentTarget.value)}
                  placeholder={selectedIndex.sortKey.type}
                  value={sortKeyValue}
                />
              </label>
            {/if}
          {/if}
        </div>
      {/if}
    </div>

    <div class="meta-row">
      <span>{bootstrap.metadata.tableName}</span>
      <span>{bootstrap.pageSize} / page</span>
      {#if busyLabel}
        <span>{busyLabel}</span>
      {/if}
      {#if !loading && savedMessageVisible}
        <span>Saved!</span>
      {/if}
      {#if dirtyCellCount > 0}
        <span>{dirtyCellCount} field{dirtyCellCount === 1 ? "" : "s"} staged</span>
        <button
          class="save-link"
          disabled={!canSave}
          on:click={saveChanges}
          type="button"
        >
          Save changes?
        </button>
      {/if}
      {#if pages.length > 0}
        <div aria-label="Pagination" class="pager" role="group">
          <button
            aria-label="Previous page"
            class="pager-button"
            disabled={!canGoPrevious}
            on:click={showPreviousPage}
            type="button"
          >
            ←
          </button>
          <span class="pager-label">Page {currentPageNumber}</span>
          <button
            aria-label="Next page"
            class="pager-button"
            disabled={!canGoNext}
            on:click={loadMore}
            type="button"
          >
            →
          </button>
        </div>
      {/if}
    </div>

    {#if error}
      <p class="error-banner" role="alert">{error}</p>
    {/if}
  </section>

  <section class="results-panel">
    <div class="results-content">
      {#if hasResults}
        <ResultsTable
          {columns}
          {items}
          metadata={bootstrap.metadata}
          busy={loading}
          dirtyRows={dirtyRowKeys}
          {dirtyColumnsByRowKey}
          {editedRowsByKey}
          {cellDrafts}
          {invalidCellKeys}
          on:updateCellDraft={handleUpdateCellDraft}
        />
      {:else}
        <div class="empty-state">
          <p>{getEmptyMessage()}</p>
        </div>
      {/if}
    </div>
  </section>
</div>

<style>
  :global(html),
  :global(body),
  :global(#root) {
    min-height: 100%;
  }

  :global(body) {
    margin: 0;
    background: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
    font-family: var(--vscode-font-family, system-ui, sans-serif);
    font-size: var(--vscode-font-size, 13px);
  }

  :global(button),
  :global(input),
  :global(select) {
    font: inherit;
  }

  .shell {
    --bg: var(--vscode-editor-background);
    --border: var(
      --vscode-panel-border,
      color-mix(in srgb, var(--vscode-editor-foreground) 16%, transparent)
    );
    --text: var(--vscode-editor-foreground);
    --text-muted: var(
      --vscode-descriptionForeground,
      color-mix(in srgb, var(--text) 64%, transparent)
    );
    --accent: var(--vscode-button-background);
    --accent-foreground: var(--vscode-button-foreground);
    --focus: var(--vscode-focusBorder, var(--accent));
    --input-bg: var(--vscode-input-background, var(--bg));
    --input-border: var(--vscode-input-border, var(--border));
    --input-text: var(--vscode-input-foreground, var(--text));
    --danger: var(--vscode-errorForeground, #c72e2e);
    --danger-bg: color-mix(in srgb, var(--danger) 14%, var(--bg));

    display: flex;
    flex-direction: column;
    min-height: 100vh;
    padding: 10px;
    gap: 10px;
    box-sizing: border-box;
  }

  .controls-panel,
  .results-panel {
    border: 1px solid var(--border);
    background: var(--bg);
  }

  .controls-panel {
    flex: 0 0 auto;
    padding: 10px;
  }

  .controls-stack {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .primary-controls {
    display: flex;
    align-items: end;
    gap: 10px;
    flex-wrap: nowrap;
  }

  .mode-field {
    flex: 0 1 320px;
    width: min(320px, 100%);
    min-width: 0;
  }

  .query-fields {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .field {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .query-fields .field {
    flex: 1 1 180px;
  }

  .field span,
  .meta-row {
    color: var(--text-muted);
    font-family: var(
      --vscode-editor-font-family,
      ui-monospace,
      "SFMono-Regular",
      monospace
    );
    font-size: 0.78rem;
  }

  .field input,
  .field select {
    width: 100%;
    min-height: 32px;
    padding: 0 10px;
    border: 1px solid var(--input-border);
    border-radius: 0;
    background: var(--input-bg);
    color: var(--input-text);
    box-sizing: border-box;
  }

  .actions {
    display: flex;
    align-items: end;
    flex: 0 0 auto;
  }

  .run-button,
  .pager-button {
    min-height: 32px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: 0;
    cursor: pointer;
  }

  .run-button {
    background: var(--accent);
    color: var(--accent-foreground);
  }

  .pager {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    margin-left: auto;
  }

  .pager-button {
    min-width: 32px;
    min-height: 24px;
    padding: 0 6px;
    background: transparent;
    color: var(--text-muted);
    border: 0;
  }

  .pager-button:not(:disabled):hover {
    color: var(--text);
  }

  .pager-label {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    padding: 0 4px;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .meta-row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    min-height: 24px;
    padding-top: 10px;
  }

  .save-link {
    display: inline-flex;
    align-items: center;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--vscode-textLink-foreground, var(--text));
    cursor: pointer;
    font: inherit;
    line-height: inherit;
    text-decoration: underline;
  }

  .save-link:hover:not(:disabled) {
    color: var(--vscode-textLink-activeForeground, var(--text));
  }

  .error-banner {
    margin: 10px 0 0;
    padding: 8px 10px;
    border: 1px solid color-mix(in srgb, var(--danger) 45%, var(--border));
    background: var(--danger-bg);
    color: var(--danger);
  }

  .results-panel {
    display: flex;
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
  }

  .results-content {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    width: 100%;
  }

  .empty-state {
    display: grid;
    flex: 1 1 auto;
    place-items: center;
    width: 100%;
    min-height: 0;
    box-sizing: border-box;
  }

  .empty-state p {
    margin: 0;
    color: var(--text-muted);
  }

  button:disabled,
  input:disabled,
  select:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  button:focus-visible,
  input:focus-visible,
  select:focus-visible {
    outline: 1px solid var(--focus);
    outline-offset: -1px;
  }

</style>
