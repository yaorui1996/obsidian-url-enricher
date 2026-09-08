import obsidianmd from "eslint-plugin-obsidianmd";
import { defineConfig } from "eslint/config";

export default defineConfig([
	{
		ignores: [
			"dist/**",
			"node_modules/**",
			"coverage/**",
			"version-bump.mjs",
			"esbuild.config.mjs",
			"esbuild.cli.config.mjs",
			"vitest.config.ts",
			"tests/**",
		],
	},

	// Obsidian plugin recommended rules (spread at top level — do NOT nest
	// this inside a files-scoped block, it carries its own per-language
	// `files` entries, e.g. a json/json language block for package.json)
	...obsidianmd.configs.recommended,

	{
		files: ["**/*.ts"],
		languageOptions: {
			parserOptions: {
				projectService: true,
			},
		},
		rules: {
			// Preset default is "off"; Obsidian's plugin scanner enables it.
			"obsidianmd/prefer-active-doc": "warn",
			"@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
		},
	},

	{
		// The fetch-title CLI runs in plain Node (bundled to dist/fetch-title.cjs),
		// not inside Obsidian, so Node globals and fetch are intentional there.
		// The obsidianmd rules don't apply to it either.
		files: ["src/cli/**/*.ts"],
		languageOptions: {
			globals: {
				process: "readonly",
				console: "readonly",
			},
		},
		rules: {
			"no-restricted-globals": "off",
			"obsidianmd/prefer-window-timers": "off",
		},
	},
	{
		// fetchTitle's default executor wraps global fetch so the plugin's
		// metadata pipeline can run outside Obsidian (the fetch-title CLI).
		// Obsidian-internal callers inject requestUrl-based executors instead.
		files: ["src/services/fetchTitle.ts"],
		rules: {
			"no-restricted-globals": ["error", { name: "localStorage" }, { name: "indexedDB" }],
		},
	},
]);
