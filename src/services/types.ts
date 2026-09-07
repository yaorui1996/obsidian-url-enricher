export interface LinkMetadata {
	title: string;
	description: string | null;
	favicon: string | null;
	siteName?: string | null; // Site name from og:site_name or application-name meta tag
	error?: string | null; // Error message if metadata fetch failed
}

/**
 * Shape of Obsidian's RequestUrlResponse, mirrored so the fetch pipeline can
 * run outside Obsidian (Node CLI) with a fetch-based executor returning this.
 */
export interface RequestUrlResponseLike {
	status: number;
	headers: Record<string, string>;
	arrayBuffer: ArrayBuffer;
	json: unknown;
	text: string;
}
