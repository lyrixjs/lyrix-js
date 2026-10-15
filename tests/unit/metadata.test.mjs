import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { MusicBrainzApi } from "musicbrainz-api";
import { MetadataService } from "../../dist/services/metadata/service.js";

afterEach(() => mock.restoreAll());

const recording = {
	id: "recording-id",
	title: "Carry You",
	length: 215905,
	"artist-credit": [{ name: "Martin Garrix" }],
};

test("looks up metadata by ISRC", async () => {
	let request;
	mock.method(MusicBrainzApi.prototype, "search", async (_entity, query) => {
		request = query;
		return { recordings: [recording] };
	});

	const result = await MetadataService.getTrackMetadata({
		isrc: "NLM5S2402145",
	});

	assert.deepEqual(request, { query: "isrc:NLM5S2402145" });
	assert.deepEqual(result, {
		trackId: "recording-id",
		trackName: "Carry You",
		artists: "Martin Garrix",
		duration: 215905,
	});
});

test("looks up metadata by URL recording relation", async () => {
	let lookupRequest;
	mock.method(MusicBrainzApi.prototype, "lookupUrl", async (_url, includes) => {
		assert.deepEqual(includes, ["recording-rels"]);
		return { relations: [{ recording: { id: "recording-id" } }] };
	});
	mock.method(
		MusicBrainzApi.prototype,
		"lookup",
		async (entity, id, includes) => {
			lookupRequest = { entity, id, includes };
			return recording;
		},
	);

	const result = await MetadataService.getTrackMetadata({
		url: "https://open.spotify.com/track/example",
	});

	assert.deepEqual(lookupRequest, {
		entity: "recording",
		id: "recording-id",
		includes: ["artists", "releases"],
	});
	assert.equal(result.trackName, "Carry You");
});

test("quotes track and artist names in combined searches", async () => {
	let request;
	mock.method(MusicBrainzApi.prototype, "search", async (_entity, query) => {
		request = query;
		return { recordings: [recording] };
	});

	await MetadataService.getTrackMetadata({
		trackName: "Carry You",
		artistName: "Martin Garrix",
	});

	assert.deepEqual(request, {
		query: 'recording:"Carry You" AND artist:"Martin Garrix"',
	});
});

test("returns null when no metadata input is provided", async () => {
	assert.equal(await MetadataService.getTrackMetadata({}), null);
});

test("looks up metadata by track name alone", async () => {
	let request;
	mock.method(MusicBrainzApi.prototype, "search", async (_entity, query) => {
		request = query;
		return { recordings: [recording] };
	});

	const result = await MetadataService.getTrackMetadata({
		trackName: "Carry You",
	});

	assert.deepEqual(request, { query: 'recording:"Carry You"' });
	assert.equal(result.trackName, "Carry You");
});

test("returns null when search has no recordings", async () => {
	mock.method(MusicBrainzApi.prototype, "search", async () => ({
		recordings: [],
	}));

	assert.equal(
		await MetadataService.getTrackMetadata({ isrc: "UNKNOWN" }),
		null,
	);
	assert.equal(
		await MetadataService.getTrackMetadata({
			trackName: "Unknown",
			artistName: "Unknown",
		}),
		null,
	);
	assert.equal(
		await MetadataService.getTrackMetadata({ trackName: "Unknown" }),
		null,
	);
});

test("returns null when URL has no recording relations", async () => {
	mock.method(MusicBrainzApi.prototype, "lookupUrl", async () => ({
		relations: [],
	}));

	const result = await MetadataService.getTrackMetadata({
		url: "https://open.spotify.com/track/unlinked",
	});
	assert.equal(result, null);
});
