import type { EditorView } from "@codemirror/view";

/**
 * Extended types for Obsidian internals that aren't in the official API
 */

/**
 * Extended Editor interface with internal CodeMirror view
 */
export interface EditorWithCM {
	cm?: EditorView;
}

/**
 * Extended MarkdownView interface with internal editor property
 */
export interface MarkdownViewWithEditor {
	editor?: EditorWithCM;
}

/**
 * Extended MarkdownView with the Reading-view (preview mode) renderer.
 * previewMode is an undocumented Obsidian internal; the rerender call site
 * feature-detects it, so the shape stays minimal here.
 */
export interface MarkdownViewWithPreview {
	getMode?: () => string;
	previewMode?: {
		rerender?: () => unknown;
	};
}
