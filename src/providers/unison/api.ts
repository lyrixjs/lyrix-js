import type { LyricsOptions } from "../../core/types";
import type { TrackMetadata } from "../../types/metadata";
import type { LyricsLine, LyricsProvider, LyricsResult } from "../provider";
import { UnisonClient } from "./client";
import type { LyricsResponse } from "./types";

const LRC_LINE_TAG = /\[(\d+):(\d+(?:[.:]\d+)?)\]/;

function parseLrcTimestamp(match: RegExpMatchArray): number | null {
	const minutes = Number(match[1]);
	const seconds = Number(match[2]?.replace(":", "."));
	if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
	return (minutes * 60 + seconds) * 1000;
}

function parseLrcLines(lyrics: string): LyricsLine[] {
	const lines: LyricsLine[] = [];
	for (const line of lyrics.split(/\r?\n/)) {
		const match = line.match(LRC_LINE_TAG);
		const text = line
			.replace(/\[\d+:\d+(?:[.:]\d+)?\]/g, "")
			.replace(/<(\d+):(\d+(?:[.:]\d+)?)>/g, "")
			.trim();
		if (!text) continue;

		if (!match) {
			lines.push({ text });
			continue;
		}

		const startTime = parseLrcTimestamp(match);
		if (startTime === null) {
			lines.push({ text });
			continue;
		}
		lines.push({ text, startTime });
	}
	return lines;
}

function parsePlainLines(lyrics: string): LyricsLine[] {
	return lyrics
		.split(/\r?\n/)
		.map((text) => text.trim())
		.filter(Boolean)
		.map((text) => ({ text }));
}

function parseSyncedLines(
	response: LyricsResponse,
): { lines: LyricsLine[]; isTimed: boolean } | null {
	const format = response.format === "plain" ? "plain" : response.format;
	if (format === "ttml") {
		const parsed = UnisonClient.parseTTML(response.lyrics);
		if (!parsed?.lyrics.trim()) return null;
		const lines = parseLrcLines(parsed.lyrics);
		return { lines, isTimed: response.syncType !== "plain" };
	}

	const lines = parseLrcLines(response.lyrics);
	if (lines.length === 0) return null;
	return {
		lines,
		isTimed:
			response.syncType !== "plain" &&
			lines.some((line) => line.startTime !== undefined),
	};
}

function toResult(
	metadata: TrackMetadata,
	response: LyricsResponse,
	synced: boolean,
): LyricsResult | null {
	if (!response.lyrics.trim()) return null;
	if (response.hidden) return null;

	const parsed = parseSyncedLines(response);
	if (!parsed || parsed.lines.length === 0) return null;

	if (synced && !parsed.isTimed) return null;
	if (synced) {
		return {
			track: metadata,
			lyricsProvider: "unison",
			lyrics: parsed.lines.map((line) => line.text),
			synced: true,
			syncedLyrics: parsed.lines,
		};
	}

	return {
		track: metadata,
		lyricsProvider: "unison",
		lyrics:
			response.format === "plain"
				? parsePlainLines(response.lyrics).map((line) => line.text)
				: parsed.lines.map((line) => line.text),
		synced: false,
	};
}

function toUnisonDuration(duration?: number): number | undefined {
	if (duration === undefined || !Number.isFinite(duration) || duration <= 0)
		return undefined;
	return Math.round(duration / 1000);
}

class UnisonProvider implements LyricsProvider {
	public readonly name = "unison";

	public constructor(private readonly client = new UnisonClient()) {}

	private async fetchUnsyncedLyrics(
		metadata: TrackMetadata,
	): Promise<LyricsResult | null> {
		try {
			const response = await this.client.getLyrics(
				metadata.trackName,
				metadata.artists,
				undefined,
				toUnisonDuration(metadata.duration),
			);
			return response ? toResult(metadata, response, false) : null;
		} catch {
			return null;
		}
	}

	private async fetchSyncedLyrics(
		metadata: TrackMetadata,
	): Promise<LyricsResult | null> {
		try {
			const response = await this.client.getLyrics(
				metadata.trackName,
				metadata.artists,
				undefined,
				toUnisonDuration(metadata.duration),
			);
			return response ? toResult(metadata, response, true) : null;
		} catch {
			return null;
		}
	}

	public async fetchLyrics(
		metadata: TrackMetadata,
		options?: LyricsOptions,
	): Promise<LyricsResult | null> {
		if (options?.sync) return this.fetchSyncedLyrics(metadata);
		return this.fetchUnsyncedLyrics(metadata);
	}
}

export const provider = new UnisonProvider();
