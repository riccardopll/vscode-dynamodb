<script lang="ts">
  import { onMount } from "svelte";

  import type { DynamoCursor, ExplorerMode, IndexMetadata } from "../types";
  import ResultsTable from "./components/ResultsTable.svelte";
  import type {
    ExtensionToWebviewMessage,
    ExplorerBootstrap,
    WebviewToExtensionMessage,
  } from "./protocol";
  import { appendResultRows, collectResultColumns } from "./results";

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
  let items: Record<string, unknown>[] = [];
  let cursor: DynamoCursor;
  let loading = false;
  let error = "";
  let lastQuery: QueryRequest | undefined;

  $: queryIndexes = bootstrap.metadata.globalSecondaryIndexes;
  $: selectedIndex = queryIndexes.find(
    (index) => index.name === selectedIndexName,
  );
  $: columns = collectResultColumns(items);
  $: hasResults = items.length > 0;
  $: hasMore = Boolean(cursor);
  $: canRunQuery = Boolean(selectedIndex) && !loading;
  $: modeHint =
    mode === "scan"
      ? "Read the table page by page."
      : "Query one global secondary index by key equality.";

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
          error = message.message;
          return;
        case "results":
          items = appendResultRows(items, message.items, message.append);
          cursor = message.cursor;
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

  function loadMore(): void {
    if (!cursor || !lastQuery) {
      return;
    }

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

  function copyItem(item: Record<string, unknown>): void {
    postMessage({
      type: "copyItem",
      item,
    });
  }

  function resetResults(): void {
    items = [];
    cursor = undefined;
    error = "";
  }

  function postMessage(message: WebviewToExtensionMessage): void {
    vscode.postMessage(message);
  }

  function formatKey(key: { name: string; type: string }): string {
    return `${key.name} (${key.type})`;
  }

  function formatOptionalKey(
    key: { name: string; type: string } | undefined,
  ): string {
    return key ? formatKey(key) : "none";
  }

  function formatIndex(index: IndexMetadata): string {
    return `${index.name}: ${formatKey(index.partitionKey)}${
      index.sortKey ? `, ${formatKey(index.sortKey)}` : ""
    }`;
  }

  function getEmptyMessage(): string {
    if (loading) {
      return "Loading results…";
    }

    if (lastQuery) {
      return "No items returned for this request.";
    }

    return "Run a scan or query to load items.";
  }
</script>

<svelte:head>
  <title>DynamoDB Explorer</title>
</svelte:head>

<div class="shell">
  <section class="panel hero">
    <div class="hero-copy">
      <p class="eyebrow">DynamoDB table</p>
      <h1>{bootstrap.metadata.tableName}</h1>
      <p class="connection">{bootstrap.profile} / {bootstrap.region}</p>
    </div>

    <dl class="meta-grid">
      <div>
        <dt>Table PK</dt>
        <dd>{formatKey(bootstrap.metadata.partitionKey)}</dd>
      </div>
      <div>
        <dt>Table SK</dt>
        <dd>{formatOptionalKey(bootstrap.metadata.sortKey)}</dd>
      </div>
      <div>
        <dt>Page size</dt>
        <dd>{bootstrap.pageSize}</dd>
      </div>
    </dl>

    <div class="index-summary">
      <div class="section-title">Indexes</div>

      {#if queryIndexes.length === 0}
        <p class="muted">No global secondary indexes</p>
      {:else}
        <ul class="index-list">
          {#each queryIndexes as index (index.name)}
            <li>{formatIndex(index)}</li>
          {/each}
        </ul>
      {/if}
    </div>
  </section>

  <section class="panel">
    <div class="controls-header">
      <div class="mode-switch" role="tablist" aria-label="Explorer mode">
        <button
          aria-pressed={mode === "scan"}
          class:active={mode === "scan"}
          disabled={loading}
          on:click={() => switchMode("scan")}
          type="button"
        >
          Scan
        </button>
        <button
          aria-pressed={mode === "query-index"}
          class:active={mode === "query-index"}
          disabled={loading || queryIndexes.length === 0}
          on:click={() => switchMode("query-index")}
          type="button"
        >
          Query index
        </button>
      </div>

      <p class="muted">{modeHint}</p>
    </div>

    {#if mode === "scan"}
      <div class="scan-action">
        <button class="primary-button" disabled={loading} on:click={runScan} type="button">
          Run scan
        </button>
      </div>
    {:else}
      <div class="query-grid">
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
            <span>{selectedIndex.partitionKey.name} ({selectedIndex.partitionKey.type})</span>
            <input
              disabled={loading}
              on:input={(event) => updatePartitionKey(event.currentTarget.value)}
              placeholder="Required"
              value={partitionKeyValue}
            />
          </label>

          {#if selectedIndex.sortKey}
            <label class="field">
              <span>{selectedIndex.sortKey.name} ({selectedIndex.sortKey.type})</span>
              <input
                disabled={loading}
                on:input={(event) => updateSortKey(event.currentTarget.value)}
                placeholder="Optional"
                value={sortKeyValue}
              />
            </label>
          {/if}

          <div class="query-action">
            <button class="primary-button" disabled={!canRunQuery} on:click={runQuery} type="button">
              Run query
            </button>
          </div>
        {:else}
          <p class="muted">This table does not expose a queryable global secondary index.</p>
        {/if}
      </div>
    {/if}

    {#if error}
      <p class="error-banner" role="alert">{error}</p>
    {/if}
  </section>

  <section class="panel">
    <div class="results-header">
      <div>
        <p class="eyebrow">Results</p>
        <p class="results-count">{items.length} loaded</p>
      </div>

      <div class="results-actions">
        {#if loading}
          <span class="muted status-chip">Loading…</span>
        {/if}

        {#if hasMore}
          <button class="secondary-button" disabled={loading} on:click={loadMore} type="button">
            Load more
          </button>
        {/if}
      </div>
    </div>

    {#if hasResults}
      <ResultsTable {columns} {items} onCopyItem={copyItem} />
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
    font-family:
      "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino,
      "Times New Roman", serif;
  }

  :global(button),
  :global(input),
  :global(select) {
    font: inherit;
  }

  .shell {
    --panel-border: color-mix(
      in srgb,
      var(--vscode-panel-border, currentColor) 82%,
      transparent
    );
    --panel-fill: color-mix(
      in srgb,
      var(--vscode-editor-background) 94%,
      var(--vscode-editor-foreground) 6%
    );
    --panel-fill-strong: color-mix(
      in srgb,
      var(--vscode-editor-background) 88%,
      var(--vscode-editor-foreground) 12%
    );
    --text-muted: color-mix(
      in srgb,
      var(--vscode-editor-foreground) 62%,
      transparent
    );
    --accent: var(--vscode-button-background);
    --accent-foreground: var(--vscode-button-foreground);
    --focus: var(--vscode-focusBorder, var(--panel-border));
    --danger: var(--vscode-errorForeground, #c92a2a);

    display: grid;
    gap: 14px;
    padding: 16px;
  }

  .panel {
    display: grid;
    gap: 14px;
    padding: 14px;
    border: 1px solid var(--panel-border);
    border-radius: 10px;
    background:
      linear-gradient(
        180deg,
        color-mix(in srgb, var(--panel-fill) 86%, transparent),
        var(--panel-fill)
      );
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.04);
  }

  .hero {
    gap: 16px;
  }

  .hero-copy h1 {
    margin: 2px 0 4px;
    font-size: clamp(2rem, 3vw, 2.8rem);
    line-height: 0.92;
    letter-spacing: -0.04em;
  }

  .eyebrow {
    margin: 0;
    color: var(--text-muted);
    font-family:
      ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, monospace;
    font-size: 0.74rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .connection,
  .muted {
    margin: 0;
    color: var(--text-muted);
  }

  .meta-grid {
    display: grid;
    gap: 12px;
    margin: 0;
  }

  .meta-grid div,
  .field,
  .index-summary {
    display: grid;
    gap: 4px;
  }

  .meta-grid dt,
  .field span,
  .section-title {
    color: var(--text-muted);
    font-family:
      ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, monospace;
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .meta-grid dd {
    margin: 0;
    font-size: 1rem;
  }

  .index-list {
    display: grid;
    gap: 8px;
    padding: 0;
    margin: 0;
    list-style: none;
  }

  .index-list li {
    padding: 9px 10px;
    border: 1px solid var(--panel-border);
    border-radius: 8px;
    background: color-mix(in srgb, var(--panel-fill-strong) 88%, transparent);
    font-family:
      ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, monospace;
    font-size: 0.88rem;
    overflow-wrap: anywhere;
  }

  .controls-header,
  .results-header {
    display: grid;
    gap: 12px;
    align-items: center;
  }

  .mode-switch {
    display: inline-grid;
    grid-auto-flow: column;
    width: fit-content;
    padding: 3px;
    border: 1px solid var(--panel-border);
    border-radius: 999px;
    background: color-mix(in srgb, var(--panel-fill-strong) 92%, transparent);
  }

  .mode-switch button,
  .primary-button,
  .secondary-button {
    border: 0;
    cursor: pointer;
    transition:
      background-color 120ms ease,
      color 120ms ease,
      border-color 120ms ease;
  }

  .mode-switch button {
    padding: 8px 14px;
    border-radius: 999px;
    background: transparent;
    color: inherit;
  }

  .mode-switch button.active {
    background: var(--accent);
    color: var(--accent-foreground);
  }

  .scan-action,
  .query-action {
    display: flex;
    align-items: end;
  }

  .query-grid {
    display: grid;
    gap: 12px;
  }

  .field input,
  .field select {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--panel-border);
    border-radius: 8px;
    background: color-mix(in srgb, var(--panel-fill-strong) 90%, transparent);
    color: inherit;
  }

  .primary-button,
  .secondary-button {
    min-height: 40px;
    padding: 0 14px;
    border-radius: 999px;
  }

  .primary-button {
    background: var(--accent);
    color: var(--accent-foreground);
  }

  .secondary-button {
    border: 1px solid var(--panel-border);
    background: transparent;
    color: inherit;
  }

  .results-count {
    margin: 2px 0 0;
    font-size: 1.02rem;
  }

  .results-actions {
    display: flex;
    gap: 10px;
    align-items: center;
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .status-chip {
    padding: 6px 10px;
    border: 1px solid var(--panel-border);
    border-radius: 999px;
    background: color-mix(in srgb, var(--panel-fill-strong) 88%, transparent);
  }

  .error-banner {
    margin: 0;
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--danger) 28%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--danger) 12%, transparent);
    color: var(--danger);
  }

  .empty-state {
    padding: 18px 14px;
    border: 1px dashed var(--panel-border);
    border-radius: 10px;
    color: var(--text-muted);
    text-align: center;
  }

  .empty-state p {
    margin: 0;
  }

  button:disabled,
  input:disabled,
  select:disabled {
    opacity: 0.58;
    cursor: not-allowed;
  }

  button:focus-visible,
  input:focus-visible,
  select:focus-visible {
    outline: 1px solid var(--focus);
    outline-offset: 2px;
  }

  @media (min-width: 860px) {
    .hero {
      grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
      align-items: start;
    }

    .index-summary {
      grid-column: 1 / -1;
    }

    .meta-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .controls-header,
    .results-header {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .query-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr)) auto;
      align-items: end;
    }

    .results-actions {
      justify-content: flex-end;
    }
  }
</style>
