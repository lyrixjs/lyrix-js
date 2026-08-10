import { TTML } from "@syncfm/ttml";
import type {
	APIErrorResponse,
	APISuccessResponse,
	LyricsResponse,
	LyricsSearchResponse,
	TTMLParseResult,
} from "./types";

export class UnisonClientError extends Error {
	public constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "UnisonClientError";
	}
}

function isApiResponse(
	value: unknown,
): value is APISuccessResponse<unknown> | APIErrorResponse {
	if (typeof value !== "object" || value === null || !("success" in value)) {
		return false;
	}

	return typeof value.success === "boolean";
}

function isSuccessResponse<T>(value: unknown): value is APISuccessResponse<T> {
	return isApiResponse(value) && value.success === true && "data" in value;
}

function isLyricsResponse(value: unknown): value is LyricsResponse {
	if (typeof value !== "object" || value === null) return false;
	const response = value as Record<string, unknown>;
	return (
		typeof response.lyrics === "string" &&
		["ttml", "lrc", "plain"].includes(String(response.format)) &&
		["richsync", "linesync", "plain"].includes(String(response.syncType))
	);
}

function isLyricsSearchResponse(
	value: unknown,
): value is LyricsSearchResponse[] {
	return Array.isArray(value);
}

export class UnisonClient {
	private readonly baseURL: string;

	public constructor(baseURL = "https://unison.boidu.dev") {
		this.baseURL = baseURL.replace(/\/$/, "");
	}

	private async request<T>(path: string): Promise<T | undefined> {
		let response: Response;
		try {
			response = await fetch(`${this.baseURL}${path}`);
		} catch (error) {
			throw new UnisonClientError("Unable to reach the Unison API.", {
				cause: error,
			});
		}

		let data: unknown;
		try {
			data = await response.json();
		} catch (error) {
			throw new UnisonClientError("Unison returned an invalid JSON response.", {
				cause: error,
			});
		}

		if (response.status === 404) return undefined;
		if (!response.ok) {
			throw new UnisonClientError(
				`Unison request failed with HTTP ${response.status}.`,
			);
		}
		if (!isApiResponse(data)) {
			throw new UnisonClientError("Unison returned an invalid response.");
		}
		if (!data.success) return undefined;
		if (!isSuccessResponse<T>(data)) {
			throw new UnisonClientError(
				"Unison returned a successful response without data.",
			);
		}
		return data.data;
	}

	public async searchSong(
		query: string,
		limit?: number,
	): Promise<LyricsSearchResponse[]> {
		if (!query.trim()) return [];
		const params = new URLSearchParams({ q: query });
		if (limit !== undefined) params.set("limit", String(limit));
		const data = await this.request<LyricsSearchResponse[]>(
			`/lyrics/search?${params}`,
		);
		return isLyricsSearchResponse(data) ? data : [];
	}

	public async getLyrics(
		song: string,
		artist: string,
		album?: string,
		duration?: number,
	): Promise<LyricsResponse | undefined> {
		if (!song.trim() || !artist.trim()) return undefined;
		const params = new URLSearchParams({ song, artist });
		if (album?.trim()) params.set("album", album);
		if (
			duration !== undefined &&
			Number.isFinite(duration) &&
			duration >= 1 &&
			duration <= 3600
		) {
			params.set("duration", String(Math.round(duration)));
		}
		const data = await this.request<LyricsResponse>(`/lyrics?${params}`);
		return isLyricsResponse(data) ? data : undefined;
	}

	public async getLyricsById(id: string): Promise<LyricsResponse | undefined> {
		if (!id.trim()) return undefined;
		const data = await this.request<LyricsResponse>(
			`/lyrics/${encodeURIComponent(id)}`,
		);
		return isLyricsResponse(data) ? data : undefined;
	}

	public static parseTTML(
		xml?: string,
		output: "lrc" | "md" = "lrc",
	): TTMLParseResult | undefined {
		if (!xml) return undefined;
		try {
			const ttml = TTML.fromString(xml);
			return {
				lyrics: output === "md" ? ttml.toLRC() : ttml.toLRC(),
				metadata: {
					duration: ttml.getDuration(),
					language: ttml.getLanguage(),
					credits: ttml.getCredits(),
					timingType: ttml.getTiming(),
				},
			};
		} catch {
			return undefined;
		}
	}
}
