import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { Client } from "lrclib-api";
import { provider as lrclibProvider } from "../../dist/providers/lrclib/api.js";

afterEach(() => mock.restoreAll());

const metadata = {
	trackId: "recording-id",
	trackName: "Carry You",
	artists: "Martin Garrix",
	duration: 215905,
};

test("fetches unsynced lyrics by default", async () => {
	let request;
	mock.method(Client.prototype, "getUnsynced", async (query) => {
		request = query;
		return [{ text: "First line" }, { text: "Second line" }];
	});

	const result = await lrclibProvider.fetchLyrics(metadata);

	assert.deepEqual(request, {
		track_name: "Carry You",
		artist_name: "Martin Garrix",
		duration: 215905,
	});
	assert.deepEqual(result, {
		track: metadata,
		lyricsProvider: "lrclib",
		lyrics: ["First line", "Second line"],
		synced: false,
	});
});

test("fetches synced lyrics when sync is enabled", async () => {
	const syncedLyrics = [{ text: "First line", startTime: 1.25 }];
	let request;
	mock.method(Client.prototype, "getSynced", async (query) => {
		request = query;
		return syncedLyrics;
	});

	const result = await lrclibProvider.fetchLyrics(metadata, { sync: true });

	assert.deepEqual(request, {
		track_name: "Carry You",
		artist_name: "Martin Garrix",
		duration: 215905,
	});
	assert.deepEqual(result, {
		track: metadata,
		lyricsProvider: "lrclib",
		lyrics: ["First line"],
		synced: true,
		syncedLyrics,
	});
});

test("returns null when LRCLIB has no lyrics", async () => {
	mock.method(Client.prototype, "getUnsynced", async () => null);

	assert.equal(await lrclibProvider.fetchLyrics(metadata), null);
});

test("sends identification headers and handles 429 retries via fetch", async () => {
	let attempts = 0;
	let requestedHeaders;
	mock.method(globalThis, "fetch", async (_url, options) => {
		attempts += 1;
		requestedHeaders = options?.headers;
		if (attempts === 1) {
			return new Response(JSON.stringify({ error: "rate limited" }), {
				status: 429,
				headers: { "Retry-After": "0.01" },
			});
		}
		return new Response(
			JSON.stringify({
				plainLyrics: "Hello world",
				instrumental: false,
			}),
			{ status: 200, headers: { "Content-Type": "application/json" } },
		);
	});

	const result = await lrclibProvider.fetchLyrics(metadata);

	assert.equal(attempts, 2);
	assert.ok(requestedHeaders);
	assert.match(requestedHeaders["User-Agent"], /Lyrix\/0\.2\.0/);
	assert.match(requestedHeaders["Lrclib-Client"], /Lyrix\/0\.2\.0/);
	assert.deepEqual(result.lyrics, ["Hello world"]);
});
