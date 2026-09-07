/**
 * Stand-in for the "obsidian" package, used ONLY by the fetch-title CLI bundle
 * (esbuild alias, see esbuild.config.mjs). The CLI always injects a fetch-based
 * request executor, so nothing here should ever run at runtime; the exports
 * just keep the bundler happy when plugin modules import obsidian symbols.
 */

export function requestUrl(): never {
	throw new Error(
		"requestUrl() called in the fetch-title CLI - this is a bug: the fetch executor was not injected"
	);
}

export class Notice {
	constructor(_message: string) {
		void _message;
	}
}

export class PluginSettingTab {}
export const App = undefined as never;
