import { Client } from "lrclib-api";
import type { LyricsOptions } from "../../core/types";
import type { TrackMetadata } from "../../types/metadata";
import type { LyricsProvider, LyricsResult } from "../provider";

const LRCLIB_USER_AGENT = "Lyrix/0.2.0 (https://github.com/lyrixjs/lyrix-js)";

function createLrcLibClient(): Client {
	const client = new Client();
	const clientInternal = client as unknown as {
		request: (path: string, options?: RequestInit) => Promise<Response>;
	};
	const originalRequest = clientInternal.request.bind(client);

	clientInternal.request = async (
		path: string,
		options?: RequestInit,
	): Promise<Response> => {
		const headers = {
			...options?.headers,
			"User-Agent": LRCLIB_USER_AGENT,
			"Lrclib-Client": LRCLIB_USER_AGENT,
		};

		let response = await originalRequest(path, { ...options, headers });
		let retries = 3;
		let backoffMs = 1500;
		while (response.status === 429 && retries > 0) {
			const retryAfter = Number(response.headers.get("retry-after"));
			const waitMs =
				Number.isFinite(retryAfter) && retryAfter > 0
					? Math.max(retryAfter * 1000, backoffMs)
					: backoffMs;
			await new Promise((resolve) => setTimeout(resolve, waitMs + 200));
			response = await originalRequest(path, { ...options, headers });
			backoffMs *= 2;
			retries -= 1;
		}

		return response;
	};

	return client;
}

class LrcLibProvider implements LyricsProvider {
	public readonly name = "lrclib";

	constructor(private client: Client = createLrcLibClient()) {}

	private async fetchUnsyncedLyrics(
		metadata: TrackMetadata,
	): Promise<LyricsResult | null> {
		const lyrics = await this.client.getUnsynced({
			track_name: metadata.trackName,
			artist_name: metadata.artists,
			...(metadata.duration === undefined
				? {}
				: { duration: metadata.duration }),
		});

		if (!lyrics) return null;

		return {
			track: metadata,
			lyricsProvider: "lrclib",
			lyrics: lyrics.map((line) => line.text),
			synced: false,
		};
	}

	private async fetchSyncedLyrics(
		metadata: TrackMetadata,
	): Promise<LyricsResult | null> {
		const syncedLyrics = await this.client.getSynced({
			track_name: metadata.trackName,
			artist_name: metadata.artists,
			...(metadata.duration === undefined
				? {}
				: { duration: metadata.duration }),
		});

		if (!syncedLyrics) return null;

		return {
			track: metadata,
			lyricsProvider: "lrclib",
			lyrics: syncedLyrics.map((line) => line.text),
			synced: true,
			syncedLyrics,
		};
	}

	public async fetchLyrics(
		metadata: TrackMetadata,
		options?: LyricsOptions,
	): Promise<LyricsResult | null> {
		if (options?.sync) {
			return this.fetchSyncedLyrics(metadata);
		}
		return this.fetchUnsyncedLyrics(metadata);
	}
}

/**
 * Built-in LRCLIB lyrics provider. Queries synced and unsynced lyrics
 * from [lrclib.net](https://lrclib.net).
 */
export const provider = new LrcLibProvider();
