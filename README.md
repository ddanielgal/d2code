# D2 Code

D2 Code is a customized T3 Code build: a minimal web GUI for coding agents.

It is optimized for Kubuntu desktop (Ubuntu + KDE).

It is optimized for the OpenCode provider.

## Installation

Make sure `opencode` is available on your PATH.

Build the deb package:

```bash
bun run dist:desktop:linux:deb
```

Install it:

```bash
sudo dpkg -i ./release/D2-Code-*.deb
```

## Development

```bash
bun run dev --no-browser
```

## Notes

This is a proof of concept. Expect bugs.

If native `node-gyp` steps fail because of a Homebrew Python setup, run commands with:

```bash
PYTHON=/usr/bin/python3 <command>
```
