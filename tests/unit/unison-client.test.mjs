import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import {
	UnisonClient,
	UnisonClientError,
} from "../../dist/providers/unison/client.js";

afterEach(() => mock.restoreAll());

const sampleLyricsResponse = {
	id: 123,
	song: "Song",
	artist: "Artist",
	lyrics: "Line 1\nLine 2",
	format: "plain",
	syncType: "plain",
};

test("UnisonClient constructor normalizes baseURL and UnisonClientError names correctly", () => {
	const err = new UnisonClientError("Custom error message");
	assert.equal(err.name, "UnisonClientError");
	assert.equal(err.message, "Custom error message");

	const clientWithSlash = new UnisonClient("https://custom.unison.dev/");
	assert.equal(clientWithSlash.baseURL, "https://custom.unison.dev");

	const defaultClient = new UnisonClient();
	assert.equal(defaultClient.baseURL, "https://unison.boidu.dev");
});

test("searchSong handles empty queries and query parameters", async () => {
	const client = new UnisonClient();
	const emptyResult = await client.searchSong("   ");
	assert.deepEqual(emptyResult, []);

	let requestedUrl;
	mock.method(globalThis, "fetch", async (url) => {
		requestedUrl = url;
		return new Response(
			JSON.stringify({
				success: true,
				data: [{ id: 1, song: "Carry You", artist: "Martin Garrix" }],
			}),
			{ status: 200, headers: { "Content-Type": "application/json" } },
		);
	});

	const result = await client.searchSong("Carry You", 5);
	assert.deepEqual(result, [
		{ id: 1, song: "Carry You", artist: "Martin Garrix" },
	]);
	assert.equal(
		requestedUrl,
		"https://unison.boidu.dev/lyrics/search?q=Carry+You&limit=5",
	);
});

test("getLyrics validates song/artist and formats duration/album", async () => {
	const client = new UnisonClient();

	assert.equal(await client.getLyrics("", "Artist"), undefined);
	assert.equal(await client.getLyrics("Song", "  "), undefined);

	let requestedUrl;
	mock.method(globalThis, "fetch", async (url) => {
		requestedUrl = url;
		return new Response(
			JSON.stringify({
				success: true,
				data: sampleLyricsResponse,
			}),
			{ status: 200 },
		);
	});

	// Valid duration within [1, 3600] and album
	const res = await client.getLyrics("Song", "Artist", "Album", 213.7);
	assert.deepEqual(res, sampleLyricsResponse);
	assert.equal(
		requestedUrl,
		"https://unison.boidu.dev/lyrics?song=Song&artist=Artist&album=Album&duration=214",
	);

	// Invalid durations (below 1, above 3600, NaN) should not be attached
	await client.getLyrics("Song", "Artist", undefined, 0);
	assert.equal(
		requestedUrl,
		"https://unison.boidu.dev/lyrics?song=Song&artist=Artist",
	);

	await client.getLyrics("Song", "Artist", undefined, 4000);
	assert.equal(
		requestedUrl,
		"https://unison.boidu.dev/lyrics?song=Song&artist=Artist",
	);
});

test("getLyricsById handles empty id and URL encoding", async () => {
	const client = new UnisonClient();

	assert.equal(await client.getLyricsById(""), undefined);
	assert.equal(await client.getLyricsById("  "), undefined);

	let requestedUrl;
	mock.method(globalThis, "fetch", async (url) => {
		requestedUrl = url;
		return new Response(
			JSON.stringify({
				success: true,
				data: sampleLyricsResponse,
			}),
			{ status: 200 },
		);
	});

	const res = await client.getLyricsById("track/123#special");
	assert.deepEqual(res, sampleLyricsResponse);
	assert.equal(
		requestedUrl,
		"https://unison.boidu.dev/lyrics/track%2F123%23special",
	);
});

test("request error handling in UnisonClient", async () => {
	const client = new UnisonClient();

	// Network failure
	mock.method(globalThis, "fetch", async () => {
		throw new Error("DNS lookup failed");
	});
	await assert.rejects(
		() => client.searchSong("test"),
		(err) =>
			err instanceof UnisonClientError &&
			err.message.includes("Unable to reach the Unison API"),
	);

	// Invalid JSON response
	mock.method(globalThis, "fetch", async () => {
		return new Response("<html>Gateway Timeout</html>", { status: 200 });
	});
	await assert.rejects(
		() => client.searchSong("test"),
		(err) =>
			err instanceof UnisonClientError &&
			err.message.includes("invalid JSON response"),
	);

	// 404 Not Found returns undefined
	mock.method(globalThis, "fetch", async () => {
		return new Response(JSON.stringify({ error: "not found" }), {
			status: 404,
		});
	});
	assert.equal(await client.getLyrics("Song", "Artist"), undefined);

	// Non-ok HTTP status (e.g. 500)
	mock.method(globalThis, "fetch", async () => {
		return new Response(JSON.stringify({ error: "internal" }), {
			status: 500,
		});
	});
	await assert.rejects(
		() => client.getLyrics("Song", "Artist"),
		(err) =>
			err instanceof UnisonClientError &&
			err.message.includes("failed with HTTP 500"),
	);

	// Non-API structure response
	mock.method(globalThis, "fetch", async () => {
		return new Response(JSON.stringify({ message: "hello" }), { status: 200 });
	});
	await assert.rejects(
		() => client.getLyrics("Song", "Artist"),
		(err) =>
			err instanceof UnisonClientError &&
			err.message.includes("invalid response"),
	);

	// success === false returns undefined
	mock.method(globalThis, "fetch", async () => {
		return new Response(
			JSON.stringify({ success: false, error: "not found" }),
			{
				status: 200,
			},
		);
	});
	assert.equal(await client.getLyrics("Song", "Artist"), undefined);

	// success === true without data field
	mock.method(globalThis, "fetch", async () => {
		return new Response(JSON.stringify({ success: true }), {
			status: 200,
		});
	});
	await assert.rejects(
		() => client.getLyrics("Song", "Artist"),
		(err) =>
			err instanceof UnisonClientError && err.message.includes("without data"),
	);
});

test("parseTTML parses valid TTML XML and handles invalid inputs", () => {
	assert.equal(UnisonClient.parseTTML(), undefined);
	assert.equal(UnisonClient.parseTTML(""), undefined);
	assert.equal(UnisonClient.parseTTML("not valid xml"), undefined);

	const validTTML = `<?xml version="1.0" encoding="utf-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata" xml:lang="en">
  <head>
    <metadata>
      <ttm:title>Test Song</ttm:title>
    </metadata>
  </head>
  <body>
    <div>
      <p begin="00:01.00" end="00:03.00">First line</p>
      <p begin="00:03.00" end="00:05.00">Second line</p>
    </div>
  </body>
</tt>`;

	const result = UnisonClient.parseTTML(validTTML, "lrc");
	assert.ok(result);
	assert.ok(result.lyrics.includes("First line"));
	assert.ok(result.lyrics.includes("Second line"));
	assert.equal(result.metadata.language, "en");

	const mdResult = UnisonClient.parseTTML(validTTML, "md");
	assert.ok(mdResult);
	assert.ok(mdResult.lyrics.includes("First line"));
});
