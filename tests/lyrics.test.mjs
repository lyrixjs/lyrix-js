import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { provider as lrclibProvider } from "../dist/providers/lrclib/api.js";
import { MetadataService } from "../dist/services/metadata/service.js";

const url = "https://open.spotify.com/track/2AMysGXOe0zzZJMtH3Nizb";

let cachedMetadata;
async function getMetadata() {
	if (!cachedMetadata) {
		cachedMetadata = await MetadataService.getTrackMetadata({ url });
	}
	assert.ok(cachedMetadata);
	return cachedMetadata;
}

function assertLyricsResult(result) {
	assert.ok(result);
	assert.equal(result.lyricsProvider, "lrclib");
	assert.ok(result.track.trackId);
	assert.ok(result.lyrics.length > 0);
	assert.equal(result.lyrics[0], "Formidable, formidable");
}

test("gets unsynced lyrics from LRCLIB", async (t) => {
	const metadata = await getMetadata();
	const result = await lrclibProvider.fetchLyrics(metadata);

	if (!result) {
		t.skip(
			"LRCLIB is rate-limited or unavailable; skipping live integration check.",
		);
		return;
	}

	assertLyricsResult(result);
	assert.equal(result.synced, false);
	assert.equal(result.syncedLyrics, undefined);
});

test("gets synced lyrics from LRCLIB", async (t) => {
	await sleep(1500);

	const metadata = await getMetadata();
	const result = await lrclibProvider.fetchLyrics(metadata, {
		sync: true,
	});

	if (!result) {
		t.skip(
			"LRCLIB is rate-limited or unavailable; skipping live integration check.",
		);
		return;
	}

	assertLyricsResult(result);
	assert.equal(result.synced, true);
	assert.ok(result.syncedLyrics);
	assert.equal(result.syncedLyrics.length, result.lyrics.length);
	assert.equal(result.syncedLyrics[0].text, result.lyrics[0]);
	assert.equal(result.syncedLyrics[0].startTime, 5.11);
});
