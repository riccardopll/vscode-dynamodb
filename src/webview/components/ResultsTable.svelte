<script lang="ts">
  export let columns: string[];
  export let items: Record<string, unknown>[];

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
  <div class="table-scroll">
    <table>
      <thead>
        <tr>
          {#each columns as column (column)}
            <th>{column}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each items as item, index (`${index}`)}
          <tr>
            {#each columns as column (column)}
              <td title={formatCell(item[column])}>
                <code>{formatCell(item[column])}</code>
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
    vertical-align: middle;
    white-space: nowrap;
  }

  thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    height: var(--header-height);
    padding: 0 10px;
    background: color-mix(
      in srgb,
      var(--vscode-editor-background) 92%,
      var(--vscode-editor-foreground) 8%
    );
    color: var(--vscode-editor-foreground);
    font-size: 0.82rem;
    font-weight: 600;
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

  td code {
    display: block;
    max-width: 48ch;
    min-width: 0;
    margin: 0;
    padding: 8px 10px;
    overflow: hidden;
    background: transparent;
    border-radius: 0;
    box-shadow: none;
    color: var(--vscode-editor-foreground);
    font-family: var(
      --vscode-editor-font-family,
      ui-monospace,
      "SFMono-Regular",
      monospace
    );
    font-size: 0.82rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
