# Wine

A Chrome setup that puts every website in deep wine: burgundy surfaces, ivory text, white links.

It has three parts:

- **`engine/`**: the Wine extension, a fork of [Dark Reader](https://github.com/darkreader/darkreader). It works out each page's colours and maps them onto the palette in `palette.mjs`:
  - backgrounds become wine, with panels a step lighter than the page
  - text becomes ivory, and blue or purple text (links) becomes white
  - dark logos and icons on see-through backgrounds are flipped to light
  - photos and video keep their colours, and PDFs stay white paper
- **`newtab/`**: a new tab page with slow liquid wine metal and an engraved wordmark.
- **`theme/gloss-red/`**: a Chrome theme for the tab strip and toolbar.

Wine has no per-site code. Every site goes through the same colour mapping.

## Build

```bash
npm install
npm run setup
npm run build
```

Then load these folders with "Load unpacked" in `chrome://extensions`, with Developer mode on:

- `dist/wine`
- `newtab/dist`
- `theme/gloss-red`

## Change the colours

Edit `palette.mjs` and run `npm run build`. `make.mjs` writes the palette into `engine/src/inject/dynamic-theme/wine-engine.ts` before it builds.

## Check a change

- `npm run shots` loads a few public sites headless with the extension and saves screenshots to `tools/out/shots`.
- `npm run flash` reloads public sites and reports, for each load, how many milliseconds the page showed un-themed colours after it first appeared. 0 is the goal.
