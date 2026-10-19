# 📣 herdr-ntfy-notify

> Stop babysitting your AI agents. Let them text you when they need help or finish the job.

A zero-dependency Herdr plugin that sends structured push notifications to your [ntfy](https://ntfy.sh) topic when agents finish or need action, **even while you are viewing their tab**. Requires Herdr 0.9.3+ and Node.js 22+.

Fork of [zom-2018/herdr-ntfy-notify](https://github.com/zom-2018/herdr-ntfy-notify). The original plugin ID is retained to reuse existing local configuration.

---

## ⚡ The Cool Stuff (Features)

- **🎭 Situation-Aware Emojis**: ntfy renders multi-emoji tags based on who is talking and what they did:
  - **Codex** gets a scroll 📜 | **OMP / Pi** get tools 🛠️ | **Hermes** gets a chat balloon 💬 | **Librarian** gets books 📚.
  - Success gets a check ✅ | Questions get a question mark ❓ | Errors get a cross ❌.
- **🚀 Sub-millisecond Local Bypass**: Auto-detects if a local ntfy server is up (e.g. `localhost:10081`) and fires alerts instantly via `curl` bypassing TLS/network lag. Falls back to Tailscale smoothly.
- **📍 Location Pings**: Pushes the exact workspace, tab, and pane ID (e.g. `Loc: app · test (pane p3)`), so you know exactly where to run `herdr` to take over.

---

## ⚙️ Quick Start

### 1. Install

#### Direct install from GitHub (recommended)

Herdr supports installing plugins directly from GitHub, as documented in the [official marketplace guide](https://herdr.dev/docs/marketplace/#install-a-plugin):

```bash
herdr plugin install dmahacker/herdr-ntfy-notify
```

This installs this fork, including its foreground-completion fixes. The plugin ID remains `zom-2018.herdr-ntfy-notify` for configuration and action commands; it is not the installation source.

#### Alternative: clone and link

For local development or a Git-managed installation, clone and link instead. Keep the cloned directory after linking.

```bash
git clone https://github.com/dmahacker/herdr-ntfy-notify.git ~/herdr-ntfy-notify
herdr plugin link ~/herdr-ntfy-notify --enabled
```

If the upstream plugin is already installed, linking this fork replaces its registration under the same ID. Existing configuration stays in place, and only one version is registered. Do not uninstall with config/state purging.

**Windows (PowerShell, Git and Node.js on PATH):** use version 0.2.1 or newer. Keep the cloned directory after linking.

```powershell
$PluginDir = Join-Path $env:LOCALAPPDATA 'herdr-plugins\herdr-ntfy-notify'
git clone https://github.com/dmahacker/herdr-ntfy-notify.git "$PluginDir"
if ($LASTEXITCODE -ne 0) { throw 'Clone failed; do not replace the plugin yet.' }
herdr plugin link "$PluginDir" --enabled
herdr plugin action invoke test --plugin zom-2018.herdr-ntfy-notify
```

No `.env` copy is needed when replacing the upstream plugin. Future updates use `git -C "$PluginDir" pull --ff-only`, then the same `plugin link` command. The test action checks delivery only; also finish an agent turn while viewing its tab to check automatic notifications.

### 2. Configure

Existing installations keep their `.env` in the plugin config directory. For a new installation, locate that directory:

```bash
herdr plugin config-dir zom-2018.herdr-ntfy-notify
```

Create a `.env` file there using the variables below. If you cloned this fork, you can instead copy its example:

```bash
CONFIG_DIR="$(herdr plugin config-dir zom-2018.herdr-ntfy-notify)"
cp ~/herdr-ntfy-notify/.env.example "$CONFIG_DIR/.env"
```

Edit that local file; never commit your ntfy topic credentials.

Configure your `.env` variables:
```dotenv
HERDR_NTFY_EXTERNAL_URL=http://localhost:10081
HERDR_NTFY_LOCAL_URL=http://127.0.0.1:10081
HERDR_NTFY_TOPIC=herdr-alerts
HERDR_NTFY_ENABLED=1
```

### 3. Test Drive
Send a mock notification to verify the piping:
```bash
herdr plugin action invoke test --plugin zom-2018.herdr-ntfy-notify
```

---

## Completion detection and limits

Herdr reports an unseen completion as `done`, but a viewed completion as `idle`. The plugin queries `herdr agent get <pane>` and uses `completion_seq`, which is independent of focus. Ordinary idle panes without a completion sequence do not generate an alert. Blocked alerts use `state_change_seq`.

Atomic receipt files in `HERDR_PLUGIN_STATE_DIR/notification-receipts` deduplicate concurrent hooks, metadata updates and read acknowledgements. Receipt keys include the server endpoint name, terminal ID, status and sequence. Herdr allocates new timestamp/counter-based terminal IDs on creation and restore, so this does not require filesystem metadata for the endpoint (Windows uses named pipes). Failed sends release their receipt so a later event may retry. No daemon restart or change to Herdr's built-in toast settings is required.

This is best-effort notification delivery, not a durable queue: a pane that closes or starts another turn before the hook queries it may no longer expose its completion. A killed hook can leave a receipt without delivery; a network failure after ntfy accepted a request can still produce duplicates. Receipts are small empty files retained for deduplication; remove old receipts only when their completions can no longer be replayed. Linux is tested; macOS/Windows are not validated for this fork.

To update a linked installation:

```bash
git -C ~/herdr-ntfy-notify pull --ff-only
herdr plugin link ~/herdr-ntfy-notify --enabled
```

## Verification

Tests use an isolated temporary directory, a fake Herdr CLI and a loopback HTTP server. They never publish to your configured ntfy topic:

```bash
node --test test_cases.js
```

Coverage includes foreground/background completion, normal idle, read acknowledgements, concurrent hooks, independent terminals/servers, blocked alerts, disabled mode, malformed events, API errors and delivery retry. Version 0.2.1 also tests a nonexistent named-pipe endpoint and reset sequence numbering under a new terminal ID. The fake CLI runs via Node on either platform; Linux regression tests do not substitute for a Windows end-to-end check.

## 📄 License

MIT License. See [LICENSE](LICENSE) for details.
