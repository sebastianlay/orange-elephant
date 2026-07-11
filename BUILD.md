# Building Orange Elephant

This guide explains how to build and test the Orange Elephant browser extension for Firefox and Chrome using the `web-ext` tool.

## Prerequisites

Install [web-ext](https://github.com/mozilla/web-ext) globally via npm:

```bash
npm install -g web-ext
```

Or use npx to run it without installing:

```bash
npx web-ext <command>
```

## Development

### Run in Firefox (live reload)

```bash
web-ext run
```

This opens Firefox with the extension loaded. Changes to source files automatically reload the extension.

Options:
- `--firefox=firefoxdeveloperedition` - Use a specific Firefox version
- `--start-url=https://news.ycombinator.com` - Open HN on startup
- `--browser-console` - Open the browser console for debugging

Example with options:

```bash
web-ext run --start-url=https://news.ycombinator.com --browser-console
```

### Run in Chrome/Chromium

```bash
web-ext run --target=chromium
```

Options:
- `--chromium-binary=/path/to/chrome` - Use a specific Chrome binary
- `--start-url=https://news.ycombinator.com` - Open HN on startup

## Linting

Check the extension for common issues:

```bash
web-ext lint
```

## Testing

The unit and DOM tests live in `tests/` and run on Node.js (22+) using the
built-in test runner, with [jsdom](https://github.com/jsdom/jsdom) simulating
the browser environment:

```bash
npm install
npm test
```

## Building

### Build for Firefox

```bash
web-ext build
```

This creates a `.zip` file in the `web-ext-artifacts/` directory, ready for submission to [addons.mozilla.org](https://addons.mozilla.org).

### Build for Chrome

The same `.zip` file works for Chrome. Build it with:

```bash
web-ext build
```

Then upload to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).

### Build options

- `--overwrite-dest` - Overwrite existing build files
- `--filename=orange-elephant-{version}.zip` - Custom filename template

Example:

```bash
web-ext build --overwrite-dest --filename=orange-elephant-{version}.zip
```

## Manual Loading (for testing)

### Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on..."
3. Select the `manifest.json` file

### Chrome

1. Open `chrome://extensions`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the extension directory

## Signing for Firefox (self-distribution)

To distribute outside of addons.mozilla.org, sign the extension:

```bash
web-ext sign --api-key=YOUR_JWT_ISSUER --api-secret=YOUR_JWT_SECRET
```

Get API credentials from [addons.mozilla.org/developers/addon/api/key](https://addons.mozilla.org/developers/addon/api/key).

## Troubleshooting

**"manifest.json not found"**
Run `web-ext` from the directory containing `manifest.json`.

**Firefox version compatibility**
Ensure Firefox 109+ for full Manifest V3 support.

**Chrome shows warnings about `browser_specific_settings`**
This is expected. Chrome ignores Firefox-specific settings but loads the extension correctly.
