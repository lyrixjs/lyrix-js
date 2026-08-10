import type { TimingType } from "@syncfm/ttml";

export interface APIErrorResponse {
	success: false;
	error: string;
	code: string;
	hint: string;
}

export interface APISuccessResponse<T> {
	success: true;
	data: T;
}

export type LyricsFormat = "ttml" | "lrc" | "plain";
export type Confidence = "low" | "medium" | "high";

export interface LyricsResponse {
	id: number;
	videoId: string;
	song: string;
	artist: string;
	album?: string;
	isrc?: string;
	lyrics: string;
	format: LyricsFormat;
	language?: string;
	syncType: "richsync" | "linesync" | "plain";
	score: number;
	effectiveScore: number;
	voteCount: number;
	confidence: Confidence;
	hidden: boolean;
	submitter?: LyricsSubmitterInfo;
	fulfilled?: LyricsFulfillmentBadge | null;
	userVote?: 1 | -1 | null;
}

interface LyricsFulfillmentBadge {
	demand: number;
	requestCount: number;
	fulfilledAt: number;
}

export interface LyricsSubmitterInfo {
	keyId: string;
	reputation: number;
	displayName: string;
}

export interface LyricsSearchResponse {
	id: number;
	videoId: string;
	song: string;
	artist: string;
	album?: string;
	isrc?: string;
	duration: number;
	format: LyricsFormat;
	language?: string;
	syncType: "richsync" | "linesync" | "plain";
	score: number;
	effectiveScore: number;
	voteCount: number;
	confidence: Confidence;
	matchScore: number;
}

export interface TTMLParseResult {
	lyrics: string;
	metadata: {
		duration: number;
		language?: string | undefined;
		credits?: string[];
		timingType?: TimingType;
	};
}
