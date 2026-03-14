<script lang="ts">
  import { onMount } from "svelte";

  import type { DynamoCursor, ExplorerMode, IndexMetadata } from "../types";
  import { collectResultColumns } from "./results";
  import type {
    ExplorerBootstrap,
    ExtensionToWebviewMessage,
    WebviewToExtensionMessage,
  } from "./protocol";
  import ResultsTable from "./components/ResultsTable.svelte";

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

  type QueryRequest = QueryRequestScan | QueryRequestIndex;

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
  let error = "";
  let lastQuery: QueryRequest | undefined;
  let pendingPageIndex: number | undefined;

  $: queryIndexes = bootstrap.metadata.globalSecondaryIndexes;
  $: selectedIndex = queryIndexes.find(
    (index) => index.name === selectedIndexName,
  );
  $: currentPage = pages[currentPageIndex];
  $: items = currentPage?.items ?? [];
  $: columns = collectResultColumns(items);
  $: hasResults = items.length > 0;
  $: canRunQuery = Boolean(selectedIndex) && !loading;
  $: canGoPrevious = !loading && currentPageIndex > 0;
  $: canGoNext =
    !loading &&
    Boolean(
      (currentPageIndex < pages.length - 1) || currentPage?.nextCursor,
    );
  $: currentPageNumber = currentPageIndex + 1;

  onMount(() => {
    const handleMessage = (
      event: MessageEvent<ExtensionToWebviewMessage>,
    ): void => {
      const message = event.data;

      switch (message.type) {
        case "setLoading":
          loading = message.loading;
          return;
        case "error":
          pendingPageIndex = undefined;
          error = message.message;
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
      }
    };

    window.addEventListener("message", handleMessage);

    return () => window.removeEventListener("message", handleMessage);
  });

  function switchMode(nextMode: ExplorerMode): void {
    if (nextMode === "query-index" && queryIndexes.length === 0) {
      return;
    }

    mode = nextMode;
    resetResults();
  }

  function selectIndex(nextIndexName: string): void {
    selectedIndexName = nextIndexName;
    partitionKeyValue = "";
    sortKeyValue = "";
    resetResults();
  }

  function updatePartitionKey(value: string): void {
    partitionKeyValue = value;
    resetResults();
  }

  function updateSortKey(value: string): void {
    sortKeyValue = value;
    resetResults();
  }

  function runScan(): void {
    resetResults();
    lastQuery = { type: "runScan" };
    postMessage({ type: "runScan" });
  }

  function runQuery(): void {
    if (!selectedIndex) {
      error = "Select an index before running a query.";
      return;
    }

    if (!partitionKeyValue.trim()) {
      error = `${selectedIndex.partitionKey.name} is required.`;
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
    postMessage(nextQuery);
  }

  function runActiveRequest(): void {
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

    if (currentPageIndex < pages.length - 1) {
      currentPageIndex += 1;
      return;
    }

    const cursor = currentPage?.nextCursor;
    if (!cursor) {
      return;
    }

    pendingPageIndex = currentPageIndex + 1;

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

    currentPageIndex -= 1;
  }

  function resetResults(): void {
    pages = [];
    currentPageIndex = 0;
    pendingPageIndex = undefined;
    error = "";
  }

  function postMessage(message: WebviewToExtensionMessage): void {
    vscode.postMessage(message);
  }

  function formatIndex(index: IndexMetadata): string {
    return `${index.name}: ${index.partitionKey.name}${
      index.sortKey ? ` / ${index.sortKey.name}` : ""
    }`;
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
</script>

<svelte:head>
  <title>DynamoDB Explorer</title>
</svelte:head>

<div class="shell">
  <section class="controls-panel">
    <div class="controls-row">
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

      {#if mode === "query-index"}
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
      {/if}

      <div class="actions">
        <button
          aria-label={mode === "scan" ? "Run Scan" : "Run Query"}
          class="run-button"
          disabled={mode === "query-index" && !canRunQuery}
          on:click={runActiveRequest}
          type="button"
        >
          ▶
        </button>
      </div>
    </div>

    <div class="meta-row">
      <span>{bootstrap.metadata.tableName}</span>
      <span>{bootstrap.pageSize} / page</span>
      {#if mode === "query-index" && selectedIndex}
        <span>{formatIndex(selectedIndex)}</span>
      {/if}
      {#if loading}
        <span>Running...</span>
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
    {#if hasResults}
      <ResultsTable {columns} {items} />
    {:else}
      <div class="empty-state">
        <p>{getEmptyMessage()}</p>
      </div>
    {/if}
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
    --surface: color-mix(
      in srgb,
      var(--bg) 92%,
      var(--vscode-editor-foreground) 8%
    );
    --surface-2: color-mix(
      in srgb,
      var(--bg) 88%,
      var(--vscode-editor-foreground) 12%
    );
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
    --input-bg: var(--vscode-input-background, var(--surface));
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

  .controls-row {
    display: grid;
    gap: 10px;
  }

  .field {
    display: grid;
    gap: 4px;
    min-width: 0;
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
    gap: 8px;
    align-items: end;
    flex-wrap: wrap;
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
    gap: 12px;
    flex-wrap: wrap;
    padding-top: 10px;
  }

  .error-banner {
    margin: 10px 0 0;
    padding: 8px 10px;
    border: 1px solid color-mix(in srgb, var(--danger) 45%, var(--border));
    background: var(--danger-bg);
    color: var(--danger);
  }

  .results-panel {
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
  }

  .empty-state {
    display: grid;
    place-items: center;
    min-height: 100%;
    padding: 24px;
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

  @media (min-width: 980px) {
    .controls-row {
      grid-template-columns:
        minmax(140px, 180px)
        repeat(3, minmax(0, 1fr))
        auto;
      align-items: end;
    }

    .mode-field {
      grid-column: span 1;
    }
  }
</style>
