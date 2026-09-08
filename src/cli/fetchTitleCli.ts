/**
 * fetch-title CLI - "URL → the text the plugin would display"
 *
 * Bundled by esbuild (dist/fetch-title.cjs, platform: node) and meant to be
 * called from terminals and external tools like openclaw:
 *
 *   node dist/fetch-title.cjs https://github.com https://obsidian.md
 *   node dist/fetch-title.cjs --plain https://github.com
 *
 * Output: one JSON object per line on stdout ({"url", "title", "description",
 * "siteName", "error", "isAttachment"}); --plain prints just the title text.
 * Diagnostics and non-zero exit on hard failures go through stderr.
 */

import { fetchTitle } from "../services/fetchTitle";

interface CliArgs {
	urls: string[];
	plain: boolean;
	timeoutMs?: number;
}

function parseArgs(argv: string[]): CliArgs {
	const args: CliArgs = { urls: [], plain: false };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--plain") {
			args.plain = true;
		} else if (arg === "--timeout") {
			const value = Number(argv[++i]);
			if (Number.isFinite(value) && value > 0) {
				args.timeoutMs = Math.round(value);
			}
		} else if (arg === "--help" || arg === "-h") {
			printUsage();
			process.exit(0);
		} else {
			args.urls.push(arg);
		}
	}
	return args;
}

function printUsage(): void {
	process.stderr.write(
		[
			"Usage: node dist/fetch-title.cjs [options] <url> [url2 ...]",
			"",
			"Options:",
			"  --plain          Print only the title text (one line per URL)",
			"  --timeout <ms>   Request timeout in milliseconds (default: 7000)",
			"  --help, -h       Show this help",
			"",
			"Output: one JSON object per line (url, title, description, siteName, error, isAttachment)",
		].join("\n") + "\n"
	);
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));

	if (args.urls.length === 0) {
		printUsage();
		process.exit(1);
	}

	let exitCode = 0;
	for (const url of args.urls) {
		try {
			const result = await fetchTitle(url, { timeoutMs: args.timeoutMs });
			if (args.plain) {
				process.stdout.write(`${result.title}\n`);
			} else {
				process.stdout.write(`${JSON.stringify(result)}\n`);
			}
			if (result.error) {
				exitCode = 2; // fetched, but flagged (HTTP error / network failure fallback)
			}
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			const stack = error instanceof Error && process.env.FETCH_TITLE_DEBUG ? `\n${error.stack}` : "";
			process.stderr.write(`fetch-title: ${url}: ${message}${stack}\n`);
			exitCode = 1;
		}
	}

	process.exit(exitCode);
}

void main();
