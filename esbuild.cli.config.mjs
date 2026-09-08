import esbuild from "esbuild";

// Fetch-title CLI bundle for use outside Obsidian (plain Node). Deliberately
// separate from the plugin build (`esbuild.config.mjs`) - it has its own
// command (`npm run build:cli`) so the main `npm run build` never touches it.
// "obsidian" is aliased to a local stub - the CLI always injects a fetch-based
// request executor, so the aliased symbols never run; this just satisfies the
// bundler for plugin modules reachable from fetchTitle().
await esbuild.build({
	entryPoints: ["src/cli/fetchTitleCli.ts"],
	bundle: true,
	platform: "node",
	format: "cjs",
	target: "es2022",
	alias: {
		obsidian: "./src/cli/obsidian-stub.ts",
	},
	logLevel: "info",
	sourcemap: false,
	treeShaking: true,
	outfile: "dist/fetch-title.cjs",
});
