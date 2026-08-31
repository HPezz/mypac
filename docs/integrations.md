# Integrations

## Headroom

The [`headroom`](../extensions/headroom/) extension can route supported Pi providers through a local [Headroom](https://github.com/chopratejas/headroom) context-optimization proxy.

### Install

`./scripts/install.sh` and `mise run --skip-tools sync` install the exact Headroom specification declared in [`.mise/global-environment`](../.mise/global-environment) through mise's pipx backend. The backend uses the globally declared `uv` installation, so no separate Headroom installation step is required.

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

See the [upstream Headroom documentation](https://headroom-docs.vercel.app/docs) for provider support and detailed usage.

## Browser automation

The [`pi-agent-browser-native`](https://github.com/fitchmultz/pi-agent-browser-native) package exposes the external [`agent-browser`](https://agent-browser.dev/) runtime as a native Pi tool.

`./scripts/install.sh` and `mise run --skip-tools sync` manage the complete required setup:

- mise installs the declared `agent-browser` version globally;
- `agent-browser install` provisions or repairs its Chrome for Testing payload;
- Pi installs the declared `pi-agent-browser-native` package globally; and
- the pinned upstream one-off doctor verifies compatibility.

Screenshots created without an explicit output path are stored in `$HOME/dev/agent-browser/screenshots`. Sync creates this directory and persists it as `AGENT_BROWSER_SCREENSHOT_DIR` through mise's global environment. This does not change `pi-agent-browser-native`'s secure temporary spill-file handling.

Optional capabilities such as `ffmpeg` are not installed by mypac.
