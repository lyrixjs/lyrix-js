<div align="center">
<img width="1983" height="793" alt="Lyrix-banner" src="https://github.com/user-attachments/assets/db378279-97d5-4014-8bd5-075b5c68abf0" />


# Lyrix

### Multi-provider lyrics retrieval with AI-powered translation, caching, and type-safe APIs.

[![npm](https://img.shields.io/npm/v/lyrix-js?style=flat-square)](https://www.npmjs.com/package/lyrix-js)
[![CI](https://img.shields.io/github/actions/workflow/status/lyrixjs/lyrix-js/ci.yml?style=flat-square&branch=main)](https://github.com/lyrixjs/lyrix-js/actions)
[![License](https://img.shields.io/github/license/lyrixjs/lyrix-js?style=flat-square)](LICENSE)
[![npm downloads](https://img.shields.io/npm/dm/lyrix-js?style=flat-square)](https://www.npmjs.com/package/lyrix-js)
[![GitHub stars](https://img.shields.io/github/stars/lyrixjs/lyrix-js?style=flat-square)](https://github.com/lyrixjs/lyrix-js/stargazers)
[![GitHub issues](https://img.shields.io/github/issues/lyrixjs/lyrix-js?style=flat-square)](https://github.com/lyrixjs/lyrix-js/issues)

</div>

---

## Features

- **Multi-provider** — query multiple lyrics sources with automatic fallback. LRCLIB included out of the box.
- **Lyrics & metadata** — retrieve track metadata by title, artist, ISRC, or URL, then fetch synced or plain lyrics.
- **AI translation** — translate lyrics into any language using OpenAI-compatible models.
- **Pluggable caching** — on-disk file cache or in-memory cache, with a `CacheAdapter` interface to bring your own.
- **Synced lyrics** — query for timestamped lines and keep them through translation.
- **TypeScript-first** — fully typed with `.d.ts` declarations included.

## Installation

```bash
npm install lyrix-js
# or
pnpm add lyrix-js
# or
yarn add lyrix-js
```

## Quick Start

```ts
import { LyrixClient, lrclibProvider } from "lyrix-js";

const client = new LyrixClient({
  providers: [lrclibProvider],
  cache: true,
});

const { lyrics } = await client.getLyrics({
  trackName: "Perfect",
  artistName: "Ed Sheeran",
});

console.log(lyrics.join("\n"));
```

### Translation

Pass `translateTo` with an API config to get translated lines alongside the originals:

```ts
const result = await client.getLyrics(
  { trackName: "Usseewa", artistName: "Ado" },
  {
    translateTo: "English",
    translation: {
      apiKey: process.env.OPENAI_API_KEY,
      model: "gpt-5.6-luna",
    },
  }
);

// Original
console.log(result.lyrics.join("\n"));

// Translated
console.log(result.translatedLyrics!.join("\n"));
```

Translations are requested in small batches using strict structured output,
which preserves the number and order of lyric lines. The service retries failed
batches and keeps the original source lines if the translation provider remains
unavailable.

### Synced Lyrics

```ts
const result = await client.getLyrics(
  { trackName: "Blinding Lights", artistName: "The Weeknd" },
  { sync: true }
);

for (const line of result.syncedLyrics!) {
  console.log(`[${line.startTime}s] ${line.text}`);
}
```

When synced lyrics are translated, timestamps are preserved on the translated lines as well (`translatedSyncedLyrics`).

## API Reference

### `LyrixClient`

#### Constructor

```ts
new LyrixClient(config: LyrixClientConfig)
```

| Option | Type | Description |
|---|---|---|
| `providers` | `LyricsProvider[]` | Array of lyrics providers, queried in order. |
| `cache` | `boolean \| CacheAdapter` | `true` enables file caching in `.lyrix-cache/`. Pass a custom adapter for other storage. |

#### `client.getLyrics(track, options?)`

Returns `Promise<LyricsResult>`.

| Param | Type | Description |
|---|---|---|
| `track` | `Track` | Query with `trackName`, `artistName`, `isrc`, and/or `url`. |
| `options` | `LyricsOptions` *(optional)* | Sync mode, translation, and provider settings. |

**`Track`**

| Field | Type | Description |
|---|---|---|
| `trackName` | `string` | Song title. |
| `artistName` | `string` | Artist name. |
| `isrc` | `string` | ISRC identifier. |
| `url` | `string` | A MusicBrainz URL to resolve metadata from. |

**`LyricsOptions`**

| Field | Type | Description |
|---|---|---|
| `sync` | `boolean` | Request timestamped (synced) lyrics. Default `false`. |
| `translateTo` | `string` | Target language name or ISO code (e.g. `"French"`, `"ja"`). |
| `translateFrom` | `string` | Source language. Defaults to auto-detection. |
| `translation` | `TranslationConfig` | API credentials — required when `translateTo` is set. |

**`TranslationConfig`**

| Field | Type | Description |
|---|---|---|
| `apiKey` | `string` | OpenAI-compatible API key. |
| `model` | `string` | Model ID (e.g. `"gpt-4o"`). |
| `baseUrl` | `string` | Optional custom endpoint for proxies/alternate providers. |

**`LyricsResult`**

| Field | Type | Description |
|---|---|---|
| `track` | `TrackMetadata` | Resolved metadata for the track. |
| `lyricsProvider` | `string` | Name of the provider that returned lyrics. |
| `lyrics` | `string[]` | Plain lyrics lines. |
| `synced` | `boolean` | Whether these are synced lyrics. |
| `syncedLyrics` | `LyricsLine[]?` | Timestamped lines (when `sync: true`). |
| `translatedLyrics` | `string[]?` | Plain translated lines. |
| `translatedSyncedLyrics` | `LyricsLine[]?` | Translated lines with original timestamps. |

**`LyricsLine`**

| Field | Type | Description |
|---|---|---|
| `text` | `string` | Line text. |
| `startTime` | `number?` | Timestamp in seconds. |

### Custom Cache Adapters

Implement `CacheAdapter` to store cached data anywhere:

```ts
interface CacheAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}
```

Built-in adapters:

| Adapter | Storage | Constructor |
|---|---|---|
| `FileCacheAdapter` | Disk (`.lyrix-cache/` by default) | `new FileCacheAdapter(path?)` |
| `MemoryCacheAdapter` | In-memory `Map` | `new MemoryCacheAdapter()` |

```ts
import { LyrixClient, MemoryCacheAdapter, lrclibProvider } from "lyrix-js";

const client = new LyrixClient({
  providers: [lrclibProvider],
  cache: new MemoryCacheAdapter(),
});
```

### Custom Lyrics Providers

Implement `LyricsProvider` to add your own source:

```ts
interface LyricsProvider {
  name: string;
  fetchLyrics(metadata: TrackMetadata, options?: LyricsOptions): Promise<LyricsResult | null>;
}
```

```ts
const myProvider: LyricsProvider = {
  name: "my-service",
  async fetchLyrics(metadata, options) {
    // fetch lyrics from your source
    return {
      track: metadata,
      lyricsProvider: this.name,
      lyrics: ["line 1", "line 2"],
    };
  },
};

const client = new LyrixClient({
  providers: [myProvider, lrclibProvider],
});
```

Providers are queried in order — the first to return a result wins.

## Errors

| Error | When |
|---|---|
| `NoLyricsFoundError` | No provider returned lyrics for the given track. |
| `TranslationError` | `translateTo` was set but no `translation` config was provided, or the API call failed. |

## Caching

When `cache` is enabled, metadata, lyrics, and translations are stored and reused:

- **Metadata** is keyed by track identifiers (ISRC, URL, or artist + title).
- **Lyrics** are keyed by track ID + provider name + sync mode.
- **Translations** are keyed by source lines + target language + model.

Versioned cache entries are invalidated when the internal schema changes, so bumping the library won't serve stale data.

## Development

```bash
git clone https://github.com/lyrixjs/lyrix-js.git
cd lyrix
pnpm install
pnpm build
pnpm test
pnpm lint
```

## License

[MIT](LICENSE) © 2026 Debangshu Das
