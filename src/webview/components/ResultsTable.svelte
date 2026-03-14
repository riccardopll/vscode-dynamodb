<script lang="ts">
  export let columns: string[];
  export let items: Record<string, unknown>[];
  export let onCopyItem: (item: Record<string, unknown>) => void;

  function formatCell(value: unknown): string {
    if (value === null || value === undefined) {
      return "";
    }

    if (typeof value === "object") {
      return JSON.stringify(value);
    }

    return String(value);
  }
</script>

<div class="table-shell">
  <table>
    <thead>
      <tr>
        {#each columns as column (column)}
          <th>{column}</th>
        {/each}
        <th>actions</th>
      </tr>
    </thead>
    <tbody>
      {#each items as item, index (`${index}`)}
        <tr>
          {#each columns as column (column)}
            <td>
              <code>{formatCell(item[column])}</code>
            </td>
          {/each}
          <td class="action-cell">
            <button on:click={() => onCopyItem(item)} type="button">copy</button>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .table-shell {
    overflow: auto;
    border: 1px solid
      color-mix(
        in srgb,
        var(--vscode-panel-border, currentColor) 82%,
        transparent
      );
    border-radius: 10px;
  }

  table {
    width: max-content;
    min-width: 100%;
    border-collapse: collapse;
  }

  th,
  td {
    padding: 10px 12px;
    border-bottom: 1px solid
      color-mix(
        in srgb,
        var(--vscode-panel-border, currentColor) 82%,
        transparent
      );
    text-align: left;
    vertical-align: top;
    white-space: nowrap;
  }

  th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: color-mix(
      in srgb,
      var(--vscode-editor-background) 86%,
      var(--vscode-editor-foreground) 14%
    );
    color: color-mix(
      in srgb,
      var(--vscode-editor-foreground) 72%,
      transparent
    );
    font-family:
      ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, monospace;
    font-size: 0.76rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  td code {
    display: inline-block;
    max-width: 44ch;
    overflow-x: auto;
    padding-bottom: 2px;
    font-family:
      ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, monospace;
    font-size: 0.86rem;
    white-space: nowrap;
    scrollbar-width: thin;
  }

  .action-cell {
    width: 1%;
  }

  button {
    min-height: 34px;
    padding: 0 12px;
    border: 1px solid
      color-mix(
        in srgb,
        var(--vscode-panel-border, currentColor) 82%,
        transparent
      );
    border-radius: 999px;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  button:focus-visible {
    outline: 1px solid var(--vscode-focusBorder, currentColor);
    outline-offset: 2px;
  }
</style>
