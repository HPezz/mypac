# Integrations

## Headroom

The [`headroom`](../extensions/headroom/) extension can route supported Pi providers through a local [Headroom](https://github.com/chopratejas/headroom) context-optimization proxy.

### Install

Install or update Headroom as a `uv` tool:

```sh
uv tool install --force "headroom-ai[all]"
```

### Use from Pi

```text
/headroom wrap
/headroom status
/headroom stop
```

`/headroom wrap` starts the proxy and points supported providers in the current Pi session at it.

### Optional TUI auto-start

Merge the following key into `~/.pi/agent/settings.json` without replacing other settings:

```json
{
  "headroom": {
    "enabled": true
  }
}
```

When `enabled` is absent or `false`, Headroom does not start automatically. Manual `/headroom` commands remain available.

### Uninstall

```sh
uv tool uninstall headroom-ai
```

See the [upstream Headroom documentation](https://headroom-docs.vercel.app/docs) for provider support and detailed usage.
