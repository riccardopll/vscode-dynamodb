<script lang="ts">
  import { createEventDispatcher } from "svelte";

  import type { TableMetadata } from "../../types";
  import {
    formatCell,
    formatEditableValue,
    getCellKey,
    getRowKey,
    hasOwnColumn,
    isKeyColumn,
    isStructuredValue,
  } from "../editing";

  interface UpdateCellDraftDetail {
    item: Record<string, unknown>;
    column: string;
    value: string;
  }

  export let columns: string[];
  export let items: Record<string, unknown>[];
  export let metadata: TableMetadata;
  export let dirtyRows: string[] = [];
  export let dirtyColumnsByRowKey: Record<string, string[]> = {};
  export let editedRowsByKey: Record<string, Record<string, unknown>> = {};
  export let cellDrafts: Record<string, string> = {};
  export let invalidCellKeys: string[] = [];
  export let busy = false;

  const dispatch = createEventDispatcher<{
    updateCellDraft: UpdateCellDraftDetail;
  }>();

  function getDisplayValue(
    item: Record<string, unknown>,
    column: string,
  ): unknown {
    const rowKey = getRowKey(item, metadata);
    return editedRowsByKey[rowKey]?.[column] ?? item[column];
  }

  function isEditableCell(
    item: Record<string, unknown>,
    column: string,
  ): boolean {
    return !isKeyColumn(column, metadata) && hasOwnColumn(item, column);
  }

  function getDraftValue(
    item: Record<string, unknown>,
    column: string,
  ): string {
    const rowKey = getRowKey(item, metadata);
    const cellKey = getCellKey(rowKey, column);
    if (cellKey in cellDrafts) {
      return cellDrafts[cellKey];
    }

    return formatEditableValue(getDisplayValue(item, column));
  }

  function isDirtyCell(rowKey: string, column: string): boolean {
    return dirtyColumnsByRowKey[rowKey]?.includes(column) ?? false;
  }

  function isInvalidCell(rowKey: string, column: string): boolean {
    return invalidCellKeys.includes(getCellKey(rowKey, column));
  }

  function isDirtyRow(rowKey: string): boolean {
    return dirtyRows.includes(rowKey);
  }

  function updateCellDraft(
    item: Record<string, unknown>,
    column: string,
    value: string,
  ): void {
    dispatch("updateCellDraft", {
      item,
      column,
      value,
    });
  }
</script>

<div class="table-shell">
  <div class="table-scroll">
    <table>
      <thead>
        <tr>
          {#each columns as column (column)}
            <th class:key-column={isKeyColumn(column, metadata)}>{column}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each items as item, index (`${index}`)}
          {@const rowKey = getRowKey(item, metadata)}
          <tr class:dirty-row={isDirtyRow(rowKey)}>
            {#each columns as column (column)}
              {@const displayValue = getDisplayValue(item, column)}
              {@const editable = isEditableCell(item, column)}
              <td
                class:dirty-cell={isDirtyCell(rowKey, column)}
                class:invalid-cell={isInvalidCell(rowKey, column)}
                class:key-cell={isKeyColumn(column, metadata)}
                title={formatCell(displayValue)}
              >
                {#if editable}
                  {#if isStructuredValue(item[column])}
                    <textarea
                      class="cell-editor cell-editor-textarea"
                      disabled={busy}
                      on:input={(event) =>
                        updateCellDraft(item, column, event.currentTarget.value)}
                      rows="4"
                      value={getDraftValue(item, column)}
                    ></textarea>
                  {:else}
                    <input
                      class="cell-editor"
                      disabled={busy}
                      on:input={(event) =>
                        updateCellDraft(item, column, event.currentTarget.value)}
                      type="text"
                      value={getDraftValue(item, column)}
                    />
                  {/if}
                {:else}
                  <code class="cell-value">{formatCell(displayValue)}</code>
                {/if}
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .table-shell {
    min-height: 100%;
  }

  .table-shell,
  .table-scroll {
    min-height: 100%;
  }

  .table-scroll {
    --header-height: 34px;
    --row-odd: var(--vscode-editor-background);
    --row-even: color-mix(
      in srgb,
      var(--vscode-editor-background) 90%,
      var(--vscode-editor-foreground) 10%
    );
    --row-hover: color-mix(
      in srgb,
      var(--vscode-editor-background) 86%,
      var(--vscode-editor-foreground) 14%
    );
    --row-dirty: color-mix(
      in srgb,
      var(--vscode-editor-background) 78%,
      var(--vscode-focusBorder) 22%
    );
    --cell-dirty: color-mix(
      in srgb,
      var(--vscode-editor-background) 68%,
      var(--vscode-inputValidation-warningBackground, #8a5a00) 32%
    );
    --cell-invalid: color-mix(
      in srgb,
      var(--vscode-editor-background) 72%,
      var(--vscode-inputValidation-errorBackground, #7f1d1d) 28%
    );
    overflow: auto;
  }

  table {
    width: max-content;
    min-width: 0;
    border-collapse: collapse;
    table-layout: auto;
  }

  th,
  td {
    padding: 0;
    border-right: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    max-width: 48ch;
    text-align: left;
    vertical-align: top;
    white-space: nowrap;
  }

  thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    height: var(--header-height);
    padding: 0 10px;
    vertical-align: middle;
    background: color-mix(
      in srgb,
      var(--vscode-editor-background) 92%,
      var(--vscode-editor-foreground) 8%
    );
    color: var(--vscode-editor-foreground);
    font-size: 0.82rem;
    font-weight: 600;
  }

  thead th.key-column {
    color: var(--vscode-textPreformat-foreground, var(--vscode-editor-foreground));
  }

  tbody tr:nth-child(odd) td {
    background: var(--row-odd);
  }

  tbody tr:nth-child(even) td {
    background: var(--row-even);
  }

  tbody tr:hover td {
    background: var(--row-hover);
  }

  tbody tr.dirty-row td {
    background: var(--row-dirty);
  }

  td.dirty-cell {
    background: var(--cell-dirty) !important;
  }

  td.invalid-cell {
    background: var(--cell-invalid) !important;
  }

  .cell-value,
  .cell-editor {
    display: block;
    width: 100%;
    max-width: 48ch;
    min-width: 0;
    margin: 0;
    padding: 8px 10px;
    overflow: hidden;
    border: 0;
    background: transparent;
    box-sizing: border-box;
    box-shadow: none;
    color: var(--vscode-editor-foreground);
    font-family: var(
      --vscode-editor-font-family,
      ui-monospace,
      "SFMono-Regular",
      monospace
    );
    font-size: 0.82rem;
  }

  .cell-value {
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cell-editor {
    min-width: 220px;
  }

  .cell-editor-textarea {
    min-height: 92px;
    resize: vertical;
    white-space: pre;
  }

  .cell-editor:focus-visible {
    outline: 1px solid var(--vscode-focusBorder, var(--vscode-button-background));
    outline-offset: -1px;
  }
</style>
