import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { Client } from "lrclib-api";
import { LyrixClient } from "../../dist/core/client.js";
import {
	NoLyricsFoundError,
	TranslationError,
} from "../../dist/core/errors.js";
import { provider as lrclibProvider } from "../../dist/providers/lrclib/api.js";
import { FileCacheAdapter } from "../../dist/services/cache/file.js";
import { MemoryCacheAdapter } from "../../dist/services/cache/memory.js";
import { MetadataService } from "../../dist/services/metadata/service.js";
import { TranslationService } from "../../dist/services/translation/service.js";

afterEach(() => mock.restoreAll());

const metadata = {
	trackId: "recording-id",
	trackName: "Carry You",
	artists: "Martin Garrix",
	duration: 215905,
};

const track = { trackName: "Carry You", artistName: "Martin Garrix" };

function mockMetadata(calls) {
	mock.method(MetadataService, "getTrackMetadata", async () => {
		calls.metadata += 1;
		return metadata;
	});
}

function mockUnsynced(calls, lines = ["First line", "Second line"]) {
	mock.method(Client.prototype, "getUnsynced", async () => {
		calls.unsynced += 1;
		return lines.map((text) => ({ text }));
	});
}

function mockSynced(calls, lines = [{ text: "First line", startTime: 1.25 }]) {
	mock.method(Client.prototype, "getSynced", async () => {
		calls.synced += 1;
		return lines;
	});
}

test("serves metadata and lyrics from cache on repeat calls", async () => {
	const calls = { metadata: 0, unsynced: 0, synced: 0 };
	mockMetadata(calls);
	mockUnsynced(calls);

	const client = new LyrixClient({
		providers: [lrclibProvider],
		cache: new MemoryCacheAdapter(),
	});

	const first = await client.getLyrics(track);
	const second = await client.getLyrics(track);

	assert.deepEqual(calls, { metadata: 1, unsynced: 1, synced: 0 });
	assert.deepEqual(second, first);
	assert.equal(first.lyricsProvider, "lrclib");
	assert.deepEqual(first.lyrics, ["First line", "Second line"]);
});

test("does not cache when no cache is configured", async () => {
	const calls = { metadata: 0, unsynced: 0, synced: 0 };
	mockMetadata(calls);
	mockUnsynced(calls);

	const client = new LyrixClient({ providers: [lrclibProvider] });

	await client.getLyrics(track);
	await client.getLyrics(track);

	assert.deepEqual(calls, { metadata: 2, unsynced: 2, synced: 0 });
});

test("caches synced and unsynced lyrics separately", async () => {
	const calls = { metadata: 0, unsynced: 0, synced: 0 };
	mockMetadata(calls);
	mockUnsynced(calls);
	mockSynced(calls);

	const client = new LyrixClient({
		providers: [lrclibProvider],
		cache: new MemoryCacheAdapter(),
	});

	const unsynced = await client.getLyrics(track);
	const synced = await client.getLyrics(track, { sync: true });
	await client.getLyrics(track);
	await client.getLyrics(track, { sync: true });

	assert.deepEqual(calls, { metadata: 1, unsynced: 1, synced: 1 });
	assert.equal(unsynced.synced, false);
	assert.equal(synced.synced, true);
	assert.deepEqual(synced.syncedLyrics, [
		{ text: "First line", startTime: 1.25 },
	]);
});

test("caches translations across calls", async () => {
	const calls = { metadata: 0, unsynced: 0, synced: 0, translate: 0 };
	mockMetadata(calls);
	mockUnsynced(calls);
	mock.method(TranslationService, "translateLines", async (lines) => {
		calls.translate += 1;
		return lines.map((line) => `translated: ${line}`);
	});

	const client = new LyrixClient({
		providers: [lrclibProvider],
		cache: new MemoryCacheAdapter(),
	});
	const options = {
		translateTo: "English",
		translation: { apiKey: "key", model: "model-a" },
	};

	const first = await client.getLyrics(track, options);
	const second = await client.getLyrics(track, options);

	assert.deepEqual(calls, {
		metadata: 1,
		unsynced: 1,
		synced: 0,
		translate: 1,
	});
	assert.deepEqual(second, first);
	assert.deepEqual(first.lyrics, ["First line", "Second line"]);
	assert.deepEqual(first.translatedLyrics, [
		"translated: First line",
		"translated: Second line",
	]);
});

test("keeps synced timestamps when serving cached translations", async () => {
	const calls = { metadata: 0, unsynced: 0, synced: 0, translate: 0 };
	mockMetadata(calls);
	mockSynced(calls);
	mock.method(TranslationService, "translateLines", async (lines) => {
		calls.translate += 1;
		return lines.map((line) => `translated: ${line}`);
	});

	const client = new LyrixClient({
		providers: [lrclibProvider],
		cache: new MemoryCacheAdapter(),
	});
	const options = {
		sync: true,
		translateTo: "English",
		translation: { apiKey: "key", model: "model-a" },
	};

	await client.getLyrics(track, options);
	const second = await client.getLyrics(track, options);

	assert.equal(calls.translate, 1);
	assert.deepEqual(second.syncedLyrics, [
		{ text: "First line", startTime: 1.25 },
	]);
	assert.deepEqual(second.lyrics, ["First line"]);
	assert.deepEqual(second.translatedSyncedLyrics, [
		{ text: "translated: First line", startTime: 1.25 },
	]);
	assert.deepEqual(second.translatedLyrics, ["translated: First line"]);
});

test("does not cache provider failures", async () => {
	const calls = { metadata: 0, unsynced: 0 };
	mockMetadata(calls);
	let attempts = 0;
	mock.method(Client.prototype, "getUnsynced", async () => {
		calls.unsynced += 1;
		attempts += 1;
		if (attempts === 1) throw new Error("provider down");
		return [{ text: "First line" }];
	});

	const client = new LyrixClient({
		providers: [lrclibProvider],
		cache: new MemoryCacheAdapter(),
	});

	await assert.rejects(client.getLyrics(track));
	const result = await client.getLyrics(track);

	assert.equal(calls.unsynced, 2);
	assert.deepEqual(result.lyrics, ["First line"]);
});

test("throws NoLyricsFoundError when metadata cannot be found", async () => {
	mock.method(MetadataService, "getTrackMetadata", async () => null);

	const client = new LyrixClient({
		providers: [lrclibProvider],
	});

	await assert.rejects(
		() => client.getLyrics({ trackName: "Nonexistent", artistName: "Ghost" }),
		(err) =>
			err instanceof NoLyricsFoundError &&
			err.title === "Nonexistent" &&
			err.artist === "Ghost" &&
			err.message.includes('No lyrics found for "Nonexistent" by Ghost'),
	);
});

test("throws NoLyricsFoundError when providers return null", async () => {
	const calls = { metadata: 0 };
	mockMetadata(calls);
	mock.method(Client.prototype, "getUnsynced", async () => null);

	const client = new LyrixClient({
		providers: [lrclibProvider],
	});

	await assert.rejects(
		() => client.getLyrics(track),
		(err) => err instanceof NoLyricsFoundError,
	);
});

test("throws TranslationError when translateTo is set without translation config", async () => {
	const calls = { metadata: 0, unsynced: 0 };
	mockMetadata(calls);
	mockUnsynced(calls);

	const client = new LyrixClient({
		providers: [lrclibProvider],
	});

	await assert.rejects(
		() => client.getLyrics(track, { translateTo: "es" }),
		(err) =>
			err instanceof TranslationError &&
			err.message.includes("no API config was provided"),
	);
});

test("resolves FileCacheAdapter when cache: true is specified", () => {
	const client = new LyrixClient({
		providers: [lrclibProvider],
		cache: true,
	});

	assert.ok(client.cache instanceof FileCacheAdapter);
});

test("applies translation to plain unsynced lyrics without timestamps", async () => {
	const calls = { metadata: 0, unsynced: 0 };
	mockMetadata(calls);
	mockUnsynced(calls);

	mock.method(TranslationService, "translateLines", async () => [
		"Primera línea",
		"Segunda línea",
	]);

	const client = new LyrixClient({
		providers: [lrclibProvider],
	});

	const result = await client.getLyrics(track, {
		translateTo: "Spanish",
		translation: { apiKey: "key", model: "model" },
	});

	assert.equal(result.synced, false);
	assert.equal(result.syncedLyrics, undefined);
	assert.deepEqual(result.lyrics, ["First line", "Second line"]);
	assert.deepEqual(result.translatedLyrics, ["Primera línea", "Segunda línea"]);
	assert.equal(result.translatedSyncedLyrics, undefined);
});
