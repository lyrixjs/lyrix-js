import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { provider as unisonProvider } from "../../dist/providers/unison/api.js";
import { UnisonClient } from "../../dist/providers/unison/client.js";

afterEach(() => mock.restoreAll());

const metadata = {
	trackId: "recording-id",
	trackName: "Never Gonna Give You Up",
	artists: "Rick Astley",
	duration: 213000,
};

const baseResponse = {
	id: 4821,
	videoId: "dQw4w9WgXcQ",
	song: "Never Gonna Give You Up",
	artist: "Rick Astley",
	score: 42,
	effectiveScore: 42,
	voteCount: 47,
	confidence: "high",
	hidden: false,
};

test("fetches plain lyrics and sends duration in seconds", async () => {
	let request;
	mock.method(UnisonClient.prototype, "getLyrics", async (...args) => {
		request = args;
		return {
			...baseResponse,
			lyrics: "First line\n\nSecond line",
			format: "plain",
			syncType: "plain",
		};
	});

	const result = await unisonProvider.fetchLyrics(metadata);

	assert.deepEqual(request, [
		"Never Gonna Give You Up",
		"Rick Astley",
		undefined,
		213,
	]);
	assert.deepEqual(result, {
		track: metadata,
		lyricsProvider: "unison",
		lyrics: ["First line", "Second line"],
		synced: false,
	});
});

test("returns unsynced lyrics for timed LRC responses", async () => {
	mock.method(UnisonClient.prototype, "getLyrics", async () => ({
		...baseResponse,
		lyrics: "[00:01.50] First line\n[00:03.00] Second line",
		format: "lrc",
		syncType: "linesync",
	}));

	const result = await unisonProvider.fetchLyrics(metadata);

	assert.deepEqual(result, {
		track: metadata,
		lyricsProvider: "unison",
		lyrics: ["First line", "Second line"],
		synced: false,
	});
});

test("returns synced lyrics for line-synced LRC responses", async () => {
	mock.method(UnisonClient.prototype, "getLyrics", async () => ({
		...baseResponse,
		lyrics: "[00:01.50] First line\n[00:03.00] Second line",
		format: "lrc",
		syncType: "linesync",
	}));

	const result = await unisonProvider.fetchLyrics(metadata, { sync: true });

	assert.deepEqual(result, {
		track: metadata,
		lyricsProvider: "unison",
		lyrics: ["First line", "Second line"],
		synced: true,
		syncedLyrics: [
			{ text: "First line", startTime: 1500 },
			{ text: "Second line", startTime: 3000 },
		],
	});
});

test("returns synced lyrics for TTML responses", async () => {
	mock.method(UnisonClient.prototype, "getLyrics", async () => ({
		...baseResponse,
		lyrics:
			'<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="0s" end="1s">Hello</p></div></body></tt>',
		format: "ttml",
		syncType: "linesync",
	}));

	const result = await unisonProvider.fetchLyrics(metadata, { sync: true });

	assert.deepEqual(result, {
		track: metadata,
		lyricsProvider: "unison",
		lyrics: ["Hello"],
		synced: true,
		syncedLyrics: [{ text: "Hello", startTime: 0 }],
	});
});

test("returns null instead of synced lyrics for plain responses", async () => {
	mock.method(UnisonClient.prototype, "getLyrics", async () => ({
		...baseResponse,
		lyrics: "Plain line",
		format: "plain",
		syncType: "plain",
	}));

	assert.equal(
		await unisonProvider.fetchLyrics(metadata, { sync: true }),
		null,
	);
});

test("returns null when a synced entry has no usable timestamps", async () => {
	mock.method(UnisonClient.prototype, "getLyrics", async () => ({
		...baseResponse,
		lyrics: "Plain-looking text",
		format: "lrc",
		syncType: "plain",
	}));

	assert.equal(
		await unisonProvider.fetchLyrics(metadata, { sync: true }),
		null,
	);
});

test("returns null for malformed or hidden responses", async () => {
	mock.method(UnisonClient.prototype, "getLyrics", async () => ({
		...baseResponse,
		lyrics: "",
		format: "ttml",
		syncType: "richsync",
	}));

	assert.equal(await unisonProvider.fetchLyrics(metadata), null);

	mock.method(UnisonClient.prototype, "getLyrics", async () => ({
		...baseResponse,
		lyrics: "Visible-looking line",
		format: "plain",
		syncType: "plain",
		hidden: true,
	}));

	assert.equal(await unisonProvider.fetchLyrics(metadata), null);
});

test("returns null when Unison request fails", async () => {
	mock.method(UnisonClient.prototype, "getLyrics", async () => {
		throw new Error("network failed");
	});

	assert.equal(await unisonProvider.fetchLyrics(metadata), null);
});
