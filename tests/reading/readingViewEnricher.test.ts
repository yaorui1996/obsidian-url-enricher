import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createReadingViewPostProcessor } from '../../src/reading/readingViewEnricher';
import { DEFAULT_SETTINGS, InlineLinkPreviewSettings } from '../../src/settings';
import type { LinkPreviewService } from '../../src/services/linkPreviewService';
import type { MarkdownPostProcessorContext } from 'obsidian';

/**
 * Reading view post processor tests.
 *
 * The processor is a pure DOM pass, so tests build elements directly under
 * happy-dom, invoke the processor with a context, and assert on the rendered
 * pill structure - no CodeMirror involved.
 */

/** Duck-typed service stub: the enricher only resolves favicons synchronously */
class FakeFaviconService {
	faviconRequested: string[] = [];

	getFaviconIconUrl(url: string): string | null {
		this.faviconRequested.push(url);
		try {
			const host = new URL(url).hostname;
			return `https://www.google.com/s2/favicons?domain=${host}&sz=128`;
		} catch {
			return null;
		}
	}
}

function createProcessor(
	service: FakeFaviconService,
	settingsOverrides: Partial<InlineLinkPreviewSettings> = {}
) {
	const settings = { ...DEFAULT_SETTINGS, ...settingsOverrides };
	return createReadingViewPostProcessor(service as unknown as LinkPreviewService, () => settings);
}

function run(
	processor: ReturnType<typeof createReadingViewPostProcessor>,
	element: HTMLElement,
	frontmatter?: Record<string, unknown>
): void {
	processor(element, { frontmatter } as MarkdownPostProcessorContext);
}

function pills(root: HTMLElement): HTMLElement[] {
	return Array.from(root.querySelectorAll('.url-preview'));
}

function pillTitles(root: HTMLElement): string[] {
	return pills(root).map((pill) => {
		const title = pill.querySelector('.url-preview__title');
		return title?.textContent ?? '';
	});
}

describe('reading view enricher', () => {
	let container: HTMLElement;
	let service: FakeFaviconService;

	beforeEach(() => {
		service = new FakeFaviconService();
		container = document.createElement('div');
		document.body.appendChild(container);
	});

	afterEach(() => {
		container.remove();
	});

	describe('style gating', () => {
		it('does nothing when the global style is inline', () => {
			container.innerHTML = '<p>see https://example.com/page here</p>';
			run(createProcessor(service, { previewStyle: 'inline' }), container);

			expect(pills(container)).toHaveLength(0);
			expect(container.querySelector('p')?.textContent).toBe('see https://example.com/page here');
			expect(service.faviconRequested).toHaveLength(0);
		});

		it('does nothing when the global style is card', () => {
			container.innerHTML = '<p>see https://example.com/page here</p>';
			run(createProcessor(service, { previewStyle: 'card' }), container);

			expect(pills(container)).toHaveLength(0);
		});

		it('frontmatter preview-style: favicon overrides a global inline style', () => {
			container.innerHTML = '<p>see https://example.com/page here</p>';
			run(createProcessor(service, { previewStyle: 'inline' }), container, { 'preview-style': 'favicon' });

			expect(pillTitles(container)).toEqual(['https://example.com/page']);
		});

		it('frontmatter preview-style: inline opts a favicon-styled note out', () => {
			container.innerHTML = '<a href="https://example.com/page" class="external-link">label</a>';
			run(createProcessor(service, { previewStyle: 'favicon' }), container, { 'preview-style': 'inline' });

			expect(pills(container)).toHaveLength(0);
			expect(container.querySelector('a')?.getAttribute('href')).toBe('https://example.com/page');
		});

		it('requireFrontmatter skips notes without plugin frontmatter', () => {
			container.innerHTML = '<p>see https://example.com/page here</p>';
			run(createProcessor(service, { previewStyle: 'favicon', requireFrontmatter: true }), container);

			expect(pills(container)).toHaveLength(0);
		});

		it('requireFrontmatter processes notes that carry plugin frontmatter', () => {
			container.innerHTML = '<p>see https://example.com/page here</p>';
			run(
				createProcessor(service, { previewStyle: 'favicon', requireFrontmatter: true }),
				container,
				{ 'preview-style': 'favicon' }
			);

			expect(pillTitles(container)).toEqual(['https://example.com/page']);
		});
	});

	describe('anchor pass', () => {
		it('replaces a markdown link anchor with a pill showing the href', () => {
			container.innerHTML = '<a href="https://example.com/page" class="external-link">Pretty Label</a>';
			run(createProcessor(service, { previewStyle: 'favicon' }), container);

			const pill = pills(container)[0];
			expect(pill).toBeDefined();
			// Text is the URL as written, never the fetched/label text
			expect(pillTitles(container)).toEqual(['https://example.com/page']);
			expect(container.querySelector('a')).toBeNull();
		});

		it('attaches the favicon resolved from the service', () => {
			container.innerHTML = '<a href="https://example.com/page">x</a>';
			run(createProcessor(service, { previewStyle: 'favicon' }), container);

			const favicon = container.querySelector<HTMLImageElement>('img.url-preview__favicon');
			expect(favicon?.src).toBe('https://www.google.com/s2/favicons?domain=example.com&sz=128');
		});

		it('ignores non-http anchors', () => {
			container.innerHTML = '<a href="mailto:someone@example.com">mail</a><a href="#section">jump</a>';
			run(createProcessor(service, { previewStyle: 'favicon' }), container);

			expect(pills(container)).toHaveLength(0);
			expect(container.querySelectorAll('a')).toHaveLength(2);
		});
	});

	describe('text pass', () => {
		it('wraps bare URLs that were not auto-linked', () => {
			container.innerHTML = '<p>see https://example.com/page here</p>';
			run(createProcessor(service, { previewStyle: 'favicon' }), container);

			expect(pillTitles(container)).toEqual(['https://example.com/page']);
			const paragraph = container.querySelector('p');
			expect(paragraph?.textContent).toBe('see https://example.com/page here');
		});

		it('splices pills around surrounding text without losing it', () => {
			container.innerHTML = '<p>see https://example.com/page here</p>';
			run(createProcessor(service, { previewStyle: 'favicon' }), container);

			const paragraph = container.querySelector('p');
			const children = Array.from(paragraph?.childNodes ?? []);
			expect(children[0]?.textContent).toBe('see ');
			expect(children[children.length - 1]?.textContent).toBe(' here');
		});

		it('leaves URLs inside code blocks alone', () => {
			container.innerHTML = '<pre><code>https://example.com/page</code></pre>';
			run(createProcessor(service, { previewStyle: 'favicon' }), container);

			expect(pills(container)).toHaveLength(0);
			expect(container.querySelector('code')?.textContent).toBe('https://example.com/page');
		});

		it('leaves URLs inside inline code alone', () => {
			container.innerHTML = '<p>prefix <code>https://example.com/page</code> suffix</p>';
			run(createProcessor(service, { previewStyle: 'favicon' }), container);

			expect(pills(container)).toHaveLength(0);
		});

		it('does not touch text inside anchors', () => {
			container.innerHTML = '<a href="mailto:someone@example.com">write to someone@example.com</a>';
			run(createProcessor(service, { previewStyle: 'favicon' }), container);

			expect(pills(container)).toHaveLength(0);
		});
	});

	describe('pill rendering', () => {
		it('renders the inline pill structure with color mode class', () => {
			container.innerHTML = '<a href="https://example.com/page">x</a>';
			run(createProcessor(service, { previewStyle: 'favicon' }), container);

			const pill = pills(container)[0];
			expect(pill?.className).toBe('url-preview url-preview--inline url-preview--subtle');
			expect(pill?.querySelector('.url-preview__text')).not.toBeNull();
		});

		it('inline-color-mode: none frontmatter lands on the pill class', () => {
			container.innerHTML = '<a href="https://example.com/page">x</a>';
			run(
				createProcessor(service, { previewStyle: 'favicon', inlineColorMode: 'subtle' }),
				container,
				{ 'inline-color-mode': 'none' }
			);

			expect(pills(container)[0]?.className).toContain('url-preview--none');
		});

		it('max-inline-length frontmatter truncates the URL text', () => {
			container.innerHTML = '<a href="https://example.com/a-very-long-path/that/keeps/going">x</a>';
			run(
				createProcessor(service, { previewStyle: 'favicon' }),
				container,
				{ 'max-inline-length': '20' }
			);

			const title = pillTitles(container)[0] ?? '';
			expect(title.length).toBeLessThanOrEqual(21); // 20 chars + ellipsis
			expect(title.endsWith('…')).toBe(true);
		});

		it('show-favicon: false still shows the icon - the mode exists for it', () => {
			container.innerHTML = '<a href="https://example.com/page">x</a>';
			run(
				createProcessor(service, { previewStyle: 'favicon' }),
				container,
				{ 'show-favicon': 'false' }
			);

			expect(container.querySelector('img.url-preview__favicon')).not.toBeNull();
		});
	});

	describe('idempotency', () => {
		it('does not double-wrap already-enriched pills on a second pass', () => {
			container.innerHTML = '<p>see https://example.com/page here</p>';
			const processor = createProcessor(service, { previewStyle: 'favicon' });

			run(processor, container);
			const firstPassPills = pills(container);
			expect(firstPassPills).toHaveLength(1);

			run(processor, container);
			expect(pills(container)).toHaveLength(1);
			expect(pills(container)[0]).toBe(firstPassPills[0]);
		});

		it('does not re-process pills nested in a re-rendered subtree', () => {
			container.innerHTML = '<a href="https://example.com/page">x</a>';
			const processor = createProcessor(service, { previewStyle: 'favicon' });

			run(processor, container);
			run(processor, container);
			expect(pills(container)).toHaveLength(1);
			expect(service.faviconRequested).toHaveLength(1);
		});
	});

	describe('attachment URLs are skipped', () => {
		it('does not touch an anchor whose href looks like a file', () => {
			container.innerHTML =
				'<a href="https://alist.yaorui.top/d/picgo/test.pdf" class="external-link">test.pdf</a>';
			run(createProcessor(service, { previewStyle: 'favicon' }), container);

			expect(pills(container)).toHaveLength(0);
			expect(container.querySelector('a')).not.toBeNull();
			expect(service.faviconRequested).toHaveLength(0);
		});

		it('leaves a bare attachment URL in a text node alone', () => {
			container.innerHTML = '<p>see https://alist.yaorui.top/d/picgo/test.pdf here</p>';
			run(createProcessor(service, { previewStyle: 'favicon' }), container);

			expect(pills(container)).toHaveLength(0);
			expect(container.querySelector('p')?.textContent).toBe(
				'see https://alist.yaorui.top/d/picgo/test.pdf here'
			);
		});

		it('skips URLs matching a configured skip rule', () => {
			container.innerHTML = '<a href="https://alist.yaorui.top/d/picgo/note.pdf">x</a>';
			run(createProcessor(service, { previewStyle: 'favicon', attachmentSkipRules: ['/d/picgo/'] }), container);

			expect(pills(container)).toHaveLength(0);
		});
	});
});
