---
title: "FigCraft MCP and CLI: How to Let AI Agents Design"
description: "Set up FigCraft MCP and the figcraft-cli so Claude Code, Cursor, or any AI agent can create, inspect, and export real UI designs. Step-by-step guide."
status: published
slug: figcraft-mcp-cli-ai-agents-guide
tags:
  - figcraft
  - figcraft-cli
  - mcp
  - model-context-protocol
  - ai-agents
  - claude-code
  - cursor
  - design-tools
  - developer-tools
  - open-source
pubDate: 2026-11-05T09:05:37.000Z
noindex: false
affiliate: false
faq:
  - question: What is FigCraft MCP?
    answer: FigCraft MCP is a local Model Context Protocol server that lets an AI agent operate FigCraft through the same command registry as the app. It can create and edit layers, inspect the document as JSON, run any menu command, and export PNG, SVG, or PDF files.
  - question: Do I need the FigCraft desktop app for the MCP server?
    answer: No. The command figcraft-cli mcp runs a headless engine with one untitled document and needs no window. Use figcraft-cli mcp --attach 7979 only when you want the agent to drive an open FigCraft window so you can watch the changes.
  - question: How do I connect FigCraft to Claude Code?
    answer: Run claude mcp add figcraft -- /absolute/path/to/figcraft-cli mcp, or add a figcraft server to the project's .mcp.json with the same command and the argument mcp. Use the absolute CLI path because GUI clients often do not inherit your shell PATH.
  - question: Does FigCraft MCP work with Cursor and VS Code?
    answer: Yes, because it is a standard stdio MCP server. Cursor and Claude Desktop use a top-level mcpServers object; VS Code uses servers and a stdio entry. The command and arguments are the same in every client.
  - question: Is FigCraft MCP safe to run locally?
    answer: The MCP server communicates over stdio, and the optional control channel listens only on 127.0.0.1. For agent work, start the server with automation read and write roots so the agent can access only the folders you choose. Confined sessions also cannot reach FigCraft or plugin servers.
  - question: Can I use FigCraft CLI in CI?
    answer: Yes. Use a pinned figcraft-cli build, disable system fonts for deterministic text rendering, and set automation roots to confine file access. The figcraft-cli run command executes a JSON or JSONL command script as one all-or-nothing undo step.
category: software-engineering
updatedDate: 2026-11-05T09:05:37.000Z
coverUrl: /media/b00fa857-f7b8-40dc-92ed-b021f890d264.png
coverAlt: "FigCraft MCP cover: the figcraft-cli mcp command beside an AI agent editing a dashboard in FigCraft"
focusKeyword: FigCraft MCP
targetIntent: informational
---

FigCraft MCP is the piece that turns an open-source design app into a tool an AI agent can actually operate. Instead of reading a screenshot or guessing at a design file, the agent gets a command registry: it can create frames, apply auto layout, set text, inspect the document as JSON, and export a PNG. The same registry powers the FigCraft interface, the `figcraft-cli`, the loopback control channel, and the MCP server. That shared surface is what makes the integration different from a design-context connector that only reads a file.

The agent story here is not a marketing badge. It is the same tool-definition and context loop that the [AI agents guide](/blog/ai-agents-beginners-guide-architecture-tools-workflows) describes: the model needs a schema it can call, a state it can inspect, and a stop condition it can verify.

FigCraft itself is an interface design and prototyping app from ArtCraft, written in pure Rust and released as open source. It is still alpha, with the project estimating about 49% parity with mature proprietary tools, but the core editor, command engine, CLI, and MCP server work end to end. The latest release at the time of writing is v0.15.1, published on 5 November 2026. Treat the version as a moving target and pin it for anything that needs to be reproducible.

## Quick answer

- FigCraft is an open-source, pure-Rust design app. Every menu item, tool, and gesture runs one of more than 400 commands.
- `figcraft-cli mcp` starts a **headless** MCP server with one untitled document. No window, no desktop app, and a CPU renderer.
- `figcraft-cli mcp --attach 7979` drives a running FigCraft app through its loopback control channel. You see every change live.
- The MCP server speaks newline-delimited JSON-RPC 2.0 over stdio and supports MCP protocol `2025-06-18`, `2025-03-26`, and `2024-11-05`.
- Any stdio MCP client can connect. Claude Code, Claude Desktop, Cursor, VS Code, and OpenCode all use the same executable and the same `mcp` argument, but their configuration keys differ.
- Use `--automation-read-root` and `--automation-write-root` to keep an agent inside a project folder. Confined sessions cannot reach network-backed collaboration or plugin servers.
- The CLI is useful without MCP: `info`, `export`, `render`, `convert`, `run`, `commands`, and `perf` cover inspection, batch edits, and CI rendering.
- FigCraft is alpha. Pin the CLI version, test the workflow on a copy of the file, and expect configuration details to change between releases.

## What is FigCraft MCP?

FigCraft was built around a command engine rather than a private scripting API. The desktop UI calls the engine, and so do the CLI, the control channel, and the MCP server. The project describes this as one registry of 400+ commands; `figcraft-cli commands --json` is the machine-readable catalogue. A command such as `layout.add`, `node.set`, `component.create`, or `export.add` takes the same parameters whether a person clicks it, a script runs it, or an agent calls it through MCP.

The MCP server lives in the `figcraft-mcp` crate and is started by the CLI. It is not a separate cloud service and it does not require an account. It reads JSON-RPC requests from standard input and writes replies to standard output. The protocol version is `2025-06-18`; older `2025-03-26` and `2024-11-05` clients are accepted. Incoming lines are limited to 32 MiB before the newline. An oversized or unterminated frame returns JSON-RPC error `-32600` and closes the session.

The server has two backends:

| Command | Backend | Best for |
| --- | --- | --- |
| `figcraft-cli mcp` | Headless, in-process engine with one untitled document | CI, batch exports, agents that never need a window |
| `figcraft-cli mcp --attach <port>` | Attached to a running app started with `figcraft --control <port>` | Pair design, demos, editing a file a person has open |

The headless mode renders with the CPU renderer and has no per-request time limit. Attached mode is different: the app answers over a loopback control channel that listens only on `127.0.0.1`, requests default to a 60-second timeout, and `--timeout SECONDS` (1–600) raises that for large batches. While an attached agent works, the app shows its avatar in the people row and outlines the layers it changed, for eight seconds after its last command. That feedback is display only; it does not create an undo step or send anything to a live session.

The important difference from a typical design-tool MCP integration is scope. A context connector usually helps an agent read a design, find components, or pull code hints. FigCraft's MCP surface is the app's action layer: the agent can create a frame, add auto layout, set fills, place an instance, inspect the result, and export it. It can also run `inspect.code` to produce CSS, HTML, React, Vue, SwiftUI, Jetpack Compose, ArkUI, Leptos, or Flutter for a layer. The trade-off is that the agent needs a clear task and a way to verify the document, not just a pile of design tokens.

Structured output matters for the same reason the [Type Server Protocol](/blog/type-server-protocol-python-pluggable-type-engine) exists: an agent that can query a model instead of scraping a rendered string spends fewer tokens on guesswork.

A fair comparison looks like this:

| | FigCraft MCP | Typical design-tool MCP |
| --- | --- | --- |
| Transport | Local stdio | Often cloud or desktop bridge |
| Modes | Headless or attached | Usually attached |
| Action surface | Same 400+ commands as the app | Often read context plus a limited action set |
| Source | Open source | Usually closed source |
| Status | Alpha, v0.15.1 | Varies by vendor |

That does not make FigCraft a drop-in replacement for a mature design tool. It makes it a useful second tool for agents that need to produce a real document rather than an image or a code mockup.

## Install figcraft-cli

The MCP server is part of the desktop downloads, not the browser editor. The release page for v0.15.1 ships a standalone macOS CLI zip, a Linux AppImage that bundles the CLI, desktop installers for macOS, Windows, and Linux, and a source tarball. The same release includes `SHA256SUMS.txt` and a detached signature.

On macOS, download `figcraft-cli-0.15.1-macos-universal.zip`, unzip it, move the binary somewhere stable, and make it executable:

```sh
unzip figcraft-cli-0.15.1-macos-universal.zip
mkdir -p ~/.local/bin
mv figcraft-cli ~/.local/bin/
chmod +x ~/.local/bin/figcraft-cli
~/.local/bin/figcraft-cli --version
```

On Linux, the AppImage bundles the CLI. You can run it without extracting anything:

```sh
chmod +x FigCraft-0.15.1-linux-x86_64.AppImage
./FigCraft-0.15.1-linux-x86_64.AppImage cli mcp
```

The `cli` argument is the bridge: `FigCraft.AppImage cli <args>` runs `figcraft-cli <args>`. The same pattern works for `export`, `run`, and `commands`. Other Linux packages (`.deb`, `.rpm`, Flatpak, or the tarball) install the desktop app; check whether the CLI is on your PATH before configuring an MCP client.

On Windows, the release page provides desktop MSI and portable builds. The documented route for the CLI is to build it from source with Rust:

```sh
git clone https://github.com/storytold/figcraft
cd figcraft
cargo build --release -p figcraft-cli
```

The binary is `target/release/figcraft-cli` on macOS and Linux, and `target\release\figcraft-cli.exe` on Windows. If you build the desktop app too, the project expects the `craft-fonts` repository next to the FigCraft checkout; without it, FigCraft falls back to system fonts. For the CLI alone, the built-in fonts plus the installed system fonts are used.

Before you configure anything, check the basics:

```sh
figcraft-cli --version
figcraft-cli --help
figcraft-cli commands --filter autoLayout
figcraft-cli info design.figcraft
```

Use the absolute path to the binary in every client configuration. GUI applications often start with a different `PATH` than your terminal, so `figcraft-cli` may work in a shell and fail inside Claude Desktop, Cursor, or VS Code.

The CLI subcommands are worth knowing even if you only plan to use MCP:

| Command | What it does |
| --- | --- |
| `info <file>` | Pages, node counts, top-level frames, styles, variables, images, and missing fonts. |
| `export <file> -o <out>` | Export a page, node, or whole file to PNG, JPG, SVG, WebP, PDF, XML, `.fig`, or Penpot. |
| `render <file> -o <out.png>` | Render the whole page with its background at a chosen scale. |
| `convert <in> <out>` | Convert by extension, including `.figcraft`, `.json`, `.fig`, `.sketch`, `.svg`, and images. |
| `run <script.json>` | Execute a JSON or JSONL command script in a headless session. |
| `commands --json` | Print the command catalogue with parameters, menu paths, shortcuts, and undoability. |
| `mcp` | Serve MCP on stdio, headless or attached. |
| `perf` | Benchmark synthetic documents and print a Markdown table of hot paths. |

## Choose headless or attached mode

Headless mode is the simplest and the most reproducible. `figcraft-cli mcp` creates one in-process engine session with one untitled document. It has no window, no app state, and no dependency on a person being at the computer. An agent can create a document from scratch, run a batch of commands, inspect it, and export it. That is the mode to use in a CI job, a scheduled task, or an agent that works from a clean slate.

Attached mode is for collaboration with a human. Start FigCraft with the control channel and open the file you want the agent to edit:

```sh
figcraft --control 7979 design.figcraft
```

Then attach the MCP server:

```sh
figcraft-cli mcp --attach 7979
```

The app listens on `127.0.0.1:7979` only, so the channel is not exposed to the network. The agent's edits appear in the open window, and the app keeps answering even when the window is minimised or covered; only a window screenshot needs the window to be drawn. If a request is large, raise the timeout:

```sh
figcraft-cli mcp --attach 7979 --timeout 300
```

Attached calls are not automatically replayed after a transport failure. The app may have applied the request before the reply was lost. The error tells you that the operation may have completed, so inspect the document before retrying an edit. The next explicit call reconnects. This is the kind of failure mode that matters when an agent is editing a file a person is also using.

A practical rule: use headless for anything that starts from a known file and ends in an export; use attached when a person wants to watch, correct, or take over. Do not use attached mode as a way to avoid learning the command model. The agent still needs to inspect the document and verify its work.

## Connect Claude Code, Cursor, VS Code, and OpenCode

The server is a standard local stdio MCP server. The command is always the absolute path to `figcraft-cli`, and the first argument is always `mcp`. What changes is the configuration shape.

### Claude Code

The CLI has a one-line installer:

```sh
claude mcp add figcraft -- /absolute/path/to/figcraft-cli mcp
```

For a project-scoped configuration, add `.mcp.json` at the repository root:

```json
{
  "mcpServers": {
    "figcraft": {
      "command": "/absolute/path/to/figcraft-cli",
      "args": ["mcp"]
    }
  }
}
```

To drive the open app instead, use a second entry with the attach arguments:

```json
{
  "mcpServers": {
    "figcraft-app": {
      "command": "/absolute/path/to/figcraft-cli",
      "args": ["mcp", "--attach", "7979"]
    }
  }
}
```

### Claude Desktop

Open Settings, then Developer, then Edit Config. The file is `claude_desktop_config.json`. Add the same `mcpServers` object:

```json
{
  "mcpServers": {
    "figcraft": {
      "command": "/absolute/path/to/figcraft-cli",
      "args": ["mcp"]
    },
    "figcraft-app": {
      "command": "/absolute/path/to/figcraft-cli",
      "args": ["mcp", "--attach", "7979"]
    }
  }
}
```

Restart Claude Desktop after saving the file. If the server does not appear, run the command manually in a terminal first; a missing binary or a wrong absolute path is the most common cause.

### Cursor

Cursor uses the same `mcpServers` shape. Put it in `.cursor/mcp.json` for a project or in the global Cursor MCP configuration:

```json
{
  "mcpServers": {
    "figcraft": {
      "command": "/absolute/path/to/figcraft-cli",
      "args": ["mcp"]
    }
  }
}
```

### VS Code

VS Code's workspace configuration uses `servers`, not `mcpServers`, and it wants an explicit stdio type. Create `.vscode/mcp.json`:

```json
{
  "servers": {
    "figcraft": {
      "type": "stdio",
      "command": "/absolute/path/to/figcraft-cli",
      "args": ["mcp"]
    }
  }
}
```

Portable `.mcp.json` files use `mcpServers`; VS Code's own format uses `servers`. Copying one shape into the other is a common reason a server never starts.

### OpenCode

OpenCode uses a top-level `mcp` object and a `command` array. Add this to `opencode.json` or `opencode.jsonc`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "figcraft": {
      "type": "local",
      "command": ["/absolute/path/to/figcraft-cli", "mcp"],
      "enabled": true
    }
  }
}
```

If you attach to the running app, add `"--attach", "7979"` to the command array. OpenCode also accepts a `timeout` value in milliseconds for long tool calls.

### Other stdio clients

Any client that supports local stdio MCP servers can use the same recipe. The generic shape is a server name, an absolute command, and an argument list. The client may ask you to approve the server or individual tool calls; read the approval prompt before accepting it. A design agent can create files and export images, so treat it like any other tool with write access.

One more practical note: if the client adds every MCP tool to the model context, FigCraft's tool list is large. If your client supports per-agent tool selection, enable only the FigCraft tools the task needs, or start with the headless server for a single workflow.

## Your first agent session

A good first task is small enough to inspect and large enough to prove the loop. Start headless, or start the app with `--control 7979` and attach if you want to watch. Then give the agent a concrete brief:

> Create a 390×844 mobile checkout screen called Checkout. Use a vertical auto layout with 24 px padding and 16 px gaps. Add a header with the title "Checkout", a product card with a name, price, and quantity, a total row, and a primary button. Use #0F172A for text, #0EA5E9 for the primary action, and #F8FAFC for cards. Inspect the document, fix any overlapping text, and export the frame to `checkout.png` at 2×.

The agent does not need a special FigCraft prompt language. It uses the MCP tools: `create_node` to make the frame and text, `set_properties` to apply fills, radius, padding, and layout, `inspect_document` to check the result, and `export` to write the PNG. The tool result is JSON, so the agent can verify sizes and positions instead of guessing from a screenshot.

A useful pattern is to batch a tree in one call. The MCP `batch` tool runs several commands as one undo step and supports step references. A step can name itself with `"as"`, and a later step can use `{"$ref": "name"}` to refer to the id that step returned. This avoids hard-coding layer ids that the engine assigned.

The CLI has the same idea in `figcraft-cli run`. A JSON script can create a frame, add text and a card, and save the result:

```json
[
  {
    "command": "node.create",
    "as": "screen",
    "params": {
      "type": "frame",
      "name": "Checkout",
      "x": 0,
      "y": 0,
      "width": 390,
      "height": 844,
      "props": {
        "fill": "#FFFFFF",
        "layout": "vertical",
        "padding": 24,
        "gap": 16
      }
    }
  },
  {
    "command": "node.create",
    "params": {
      "type": "text",
      "parent": { "$ref": "screen" },
      "text": "Checkout",
      "props": {
        "fontSize": 32,
        "fontStyle": "Bold",
        "fill": "#0F172A"
      }
    }
  },
  {
    "command": "node.create",
    "params": {
      "type": "rectangle",
      "parent": { "$ref": "screen" },
      "name": "Product card",
      "width": 342,
      "height": 120,
      "props": {
        "fill": "#F8FAFC",
        "cornerRadius": 16
      }
    }
  }
]
```

Save the script as `checkout.json`, run it, and export the frame:

```sh
figcraft-cli run checkout.json --out checkout.figcraft
figcraft-cli export checkout.figcraft -o checkout.png --node Checkout --scale 2
```

The `run` command is all-or-nothing: if a later step fails, the document rolls back, `--out` is not saved, and the process exits with code 1. That makes it safe to retry a failed batch without leaving a half-built document behind. The same rules apply to MCP `batch`: by default the first failure rolls back the whole batch; `"onError": "continue"` runs the remaining steps and reports each result separately.

When the agent exports, decide whether you want bytes or a file. The MCP `export` tool without a `path` returns the image as MCP image content, which is useful when the agent should look at the result. With a `path`, it writes the file and respects the automation roots. For large exports, give it a path instead of sending a huge image back through the model context.

## CLI workflows that pay for themselves

Even if you never connect an MCP client, the CLI is a useful design automation tool. `figcraft-cli info` gives you a quick inventory of a file: pages, node counts, top-level frames, styles, variables, images, and missing fonts. It also reads `.fig`, `.sketch`, `.svg`, and REST API file JSON, with best-effort warnings for what it could not import.

`figcraft-cli export` is the workhorse. A directory output writes one file per top-level frame, named after the frame. An image output writes one file for the page or for the node named by `--node`. The format comes from `--format` or the output extension, and `--scale` applies to raster formats.

```sh
figcraft-cli export design.figcraft -o exports/ --scale 2
figcraft-cli export design.figcraft -o hero.svg --node "Hero"
figcraft-cli export design.figcraft -o screens.pdf --page "Screens"
figcraft-cli export design.figcraft -o handoff.fig
```

`figcraft-cli render` is a faster path when you only need the page as an image. It renders the whole page with its background, scales large pages down to fit 16384 px, and supports PNG, JPG, and WebP.

`figcraft-cli convert` changes formats by extension. It can turn `.figcraft` into JSON, SVG, PNG, PDF, `.fig`, or a Penpot 2.x archive, and it can import `.fig` and `.sketch` files on a best-effort basis. The `.fig` exporter is experimental; the CLI prints notes for what it left out, and other apps may not open every file.

`figcraft-cli commands --json` is the reference for agents and scripts. It prints every command with its label, shortcut, undoable flag, and parameter docs. When an agent does not know which command to use, this is the authoritative list, not a blog post or an old prompt.

If you already run agent pipelines, the [Harness AI DevOps agents guide](/blog/harness-ai-devops-agents-guide) covers the orchestration layer around a tool like this; FigCraft is the design executor, not the scheduler.

For CI, two flags matter. `--no-system-fonts` (or `FIGCRAFT_NO_SYSTEM_FONTS=1`) makes text render with only FigCraft's built-in fonts, so a PNG does not change because one runner has a different font installed. The automation roots keep the job inside the checkout and an output folder:

```sh
figcraft-cli render in/design.figcraft -o out/page.png \
  --scale 2 \
  --no-system-fonts \
  --automation-read-root in \
  --automation-write-root out
```

That command can read `in/design.figcraft` and write `out/page.png`. It cannot read or write anywhere else. If you give it only a read root, it cannot write to disk at all; exports without a `path` still return bytes to the caller.

## Security, confinement, and reproducibility

The MCP server is a local process, but "local" is not the same as "safe to give your whole home directory." An agent with a design tool can read files, write exports, and run commands. The automation roots are the main boundary.

`--automation-read-root DIR` and `--automation-write-root DIR` are repeatable, and each folder must already exist. Reads are allowed inside a read or write root; writes are allowed only inside a write root. Everything else is refused with a normal tool error, for example `automation path rejected: /etc/x.png is outside the folders that may be written: /work/project/out`. Relative paths are resolved against the server's working directory, symlinks are followed, and a path outside the roots gets the same refusal whether or not it exists. A confined session also cannot reach FigCraft or plugin servers, so collaboration, team libraries, and plugin directories are refused.

The roots apply to the **headless** server. In attached mode, the app runs the commands, so the app must be started with the same flags:

```sh
figcraft --control 7979 \
  --automation-read-root /work/project \
  --automation-write-root /work/project/out
```

`figcraft-cli mcp --attach` refuses automation roots because it would be the wrong place to enforce them. The app's own window is confined too, including input injected through the control channel. That is useful when a person and an agent share the same project.

The boundary has limits. The docs are explicit that a path is checked and then opened, so another program that swaps a folder for a symlink in between can still win that race. If that matters, run the server as a user that cannot change the roots, or put the work in a container. Also remember that a root on a network share is still a root: files read and written there go to that file server. Give only roots you would let the agent's exports reach.

The same boundary thinking applies beyond design files. The [global security vulnerabilities guide](/blog/global-security-vulnerabilities-php-node-go-oracle-guide) covers injection, secrets, dependency risk, and the failure modes that show up when an agent can reach a production system.

For reproducibility, pin the CLI version and verify the release artifacts. The release page publishes `SHA256SUMS.txt` and a detached signature. Store the version in your project's tooling notes, and rerun a known export after an upgrade. FigCraft is alpha, so a command or a default can change between minor releases. The MCP protocol is versioned, but the command parameters are the part most likely to move.

Finally, review what the MCP client is allowed to do. Some clients ask for approval per tool call; others trust the whole server. Start with a project folder and an output folder, not your home directory. Keep secrets out of prompts and out of the design file. A design agent does not need access to your shell history, SSH keys, or production credentials.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `figcraft-cli: command not found` | The binary is not on `PATH`, or the client has a different `PATH` | Use the absolute path in the client config; test it in a terminal first. |
| MCP client does not list FigCraft | Wrong config key or wrong JSON shape | Claude/Cursor use `mcpServers`; VS Code uses `servers`; OpenCode uses `mcp`. Restart the client after saving. |
| `--attach` fails to connect | FigCraft is not running with `--control`, or the port is wrong | Start `figcraft --control 7979`, then attach to `7979`. The channel is loopback-only. |
| `automation path rejected` | The path is outside the configured roots | Add the folder as a read or write root, or move the file into an allowed folder. |
| Text looks different on another machine | System fonts differ | Use `--no-system-fonts` or install the same fonts on every runner. |
| A large batch times out in attached mode | The default 60-second request limit is too low | Add `--timeout 300` or split the batch. Headless mode has no such limit. |
| Export reply is too large for the client | The image is being returned inline | Give `export` a `path`; use a lower scale for previews. |
| The agent edits the wrong file | Attached mode is showing a different tab | Start the app with the target file, or use the `document` argument on tools that support it. |
| A client connects but no tools appear | The server started but the client has not finished the handshake | Check the client's MCP logs, run `figcraft-cli mcp` manually, and restart the client. |
| An alpha release changed behavior | The CLI version moved | Pin the version, read the release notes, and test on a copy before upgrading. |

Most FigCraft tool errors are ordinary, readable errors rather than crashes. If an agent reports "no such node" or "invalid parameters," inspect the document and the command docs before retrying. A failed `batch` is rolled back; a failed `run` writes nothing. That makes recovery less destructive than a partial manual edit.

## Frequently asked questions

### What is FigCraft MCP?

FigCraft MCP is a local Model Context Protocol server that exposes FigCraft's command engine to an AI agent. It can create and edit layers, run any menu command, inspect the document as JSON, and export images. It is not a cloud service and does not require a FigCraft account.

### Do I need the FigCraft desktop app for the MCP server?

No. `figcraft-cli mcp` is headless and creates an in-process engine session with one untitled document. The desktop app is optional. Use `--attach` only when you want the agent to work inside an open FigCraft window so you can watch or take over.

### How do I connect FigCraft to Claude Code?

Run `claude mcp add figcraft -- /absolute/path/to/figcraft-cli mcp`, or add a `figcraft` entry to `.mcp.json` with the same command and `["mcp"]` arguments. Use the absolute path; a GUI client may not see the same `PATH` as your shell.

### Does FigCraft MCP work with Cursor and VS Code?

Yes. It is a standard stdio MCP server, so any client that supports local stdio servers can run it. Cursor and Claude Desktop use `mcpServers`; VS Code uses `servers` with `"type": "stdio"`. OpenCode uses `mcp` with a `command` array.

### Is FigCraft MCP safe to run locally?

It is as safe as the permissions you give it. The MCP server uses stdio, and the control channel listens only on `127.0.0.1`. Start it with automation roots so the agent can only read and write inside the folders you choose. For stronger isolation, run it as a dedicated user or in a container.

### Can I use FigCraft CLI in CI?

Yes. Use a pinned `figcraft-cli` release, `--no-system-fonts` for consistent text, and automation roots to confine file access. `figcraft-cli run` executes a JSON or JSONL script as one all-or-nothing undo step, which is a good fit for a build pipeline.

### How is FigCraft MCP different from Figma MCP?

FigCraft's MCP server exposes the same 400+ command registry as its UI, including document edits and exports. Many design-tool MCP integrations focus on reading design context, components, or code hints. FigCraft is also open source, local, and alpha; a mature proprietary tool may still be the better choice for production design teams.

## Sources and further reading

- [FigCraft MCP server documentation](https://github.com/storytold/figcraft/blob/main/docs/mcp.md)
- [figcraft-cli documentation](https://github.com/storytold/figcraft/blob/main/docs/cli.md)
- [FigCraft control protocol](https://github.com/storytold/figcraft/blob/main/docs/control-protocol.md)
- [FigCraft repository](https://github.com/storytold/figcraft)
- [FigCraft releases](https://github.com/storytold/figcraft/releases/latest)
- [FigCraft on ArtCraft](https://getartcraft.com/apps/figcraft)
- [Model Context Protocol specification](https://modelcontextprotocol.io)
- [Claude Code MCP documentation](https://docs.anthropic.com/en/docs/claude-code/mcp)
- [VS Code MCP documentation](https://code.visualstudio.com/docs/copilot/customization/mcp-servers)
- [OpenCode MCP documentation](https://opencode.ai/docs/mcp-servers/)
