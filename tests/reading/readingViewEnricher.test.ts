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
 * output - no CodeMirror involved.
 *
 * The favicon style renders each web link as a `.url-preview--inline` pill
 * carrying the site's favicon and the link's own 文字 label (or the URL for a
 * bare link), leaving the source `[text](url)` untouched.
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
	return Array.from(root.querySelectorAll('.url-preview--inline'));
}

function icons(root: HTMLElement): HTMLImageElement[] {
	return Array.from(root.querySelectorAll('img.url-preview__favicon'));
}

function iconSrcs(root: HTMLElement): string[] {
	return icons(root).map((icon) => icon.src);
}

function pillTexts(root: HTMLElement): string[] {
	return pills(root).map((pill) => pill.textContent ?? "");
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
			container.innerHTML = '<a href="https://example.com/page" class="external-link">label</a>';
			run(createProcessor(service, { previewStyle: 'inline' }), container, { 'preview-style': 'favicon' });

			expect(pills(container)).toHaveLength(1);
			expect(pillTexts(container)).toEqual(['label']);
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
			container.innerHTML = '<a href="https://example.com/page">x</a>';
			run(
				createProcessor(service, { previewStyle: 'favicon', requireFrontmatter: true }),
				container,
				{ 'preview-style': 'favicon' }
			);

			expect(pills(container)).toHaveLength(1);
		});
	});

	describe('anchor pass', () => {
		it('replaces the anchor with a pill that keeps the 文字 label', () => {
			container.innerHTML = '<a href="https://example.com/page" class="external-link">文字</a>';
			run(createProcessor(service, { previewStyle: 'favicon' }), container);

			const pill = pills(container)[0];
			expect(pill).toBeDefined();
			// The pill is the inline capsule: favicon + the original label text.
			expect(pill?.className).toContain('url-preview--inline');
			expect(pill?.textContent).toBe('文字');
			// A favicon icon is rendered first.
			expect(icons(container)).toHaveLength(1);
			expect(pill?.firstChild).toBe(icons(container)[0]);
		});

		it('attaches the favicon resolved from the service', () => {
			container.innerHTML = '<a href="https://example.com/page">x</a>';
			run(createProcessor(service, { previewStyle: 'favicon' }), container);

			expect(iconSrcs(container)).toEqual(['https://www.google.com/s2/favicons?domain=example.com&sz=128']);
		});

		it('ignores non-http anchors', () => {
			container.innerHTML = '<a href="mailto:someone@example.com">mail</a><a href="#section">jump</a>';
			run(createProcessor(service, { previewStyle: 'favicon' }), container);

			expect(pills(container)).toHaveLength(0);
			expect(container.querySelectorAll('a')).toHaveLength(2);
		});
	});

	describe('text pass', () => {
		it('turns bare URLs that were not auto-linked into a URL pill, keeping the URL text', () => {
			container.innerHTML = '<p>see https://example.com/page here</p>';
			run(createProcessor(service, { previewStyle: 'favicon' }), container);

			const pill = pills(container)[0];
			expect(pill).toBeDefined();
			expect(pill?.textContent).toBe('https://example.com/page');
			// The full sentence text is preserved around the URL pill.
			expect(container.querySelector('p')?.textContent).toBe('see https://example.com/page here');
		});

		it('splices pills around surrounding text without losing it', () => {
			container.innerHTML = '<p>see https://example.com/page here</p>';
			run(createProcessor(service, { previewStyle: 'favicon' }), container);

			const paragraph = container.querySelector('p');
			expect(paragraph?.textContent?.startsWith('see ')).toBe(true);
			expect(paragraph?.textContent?.endsWith(' here')).toBe(true);
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

	describe('icon rendering', () => {
		it('renders the favicon icon with its styling class', () => {
			container.innerHTML = '<a href="https://example.com/page">x</a>';
			run(createProcessor(service, { previewStyle: 'favicon' }), container);

			const icon = icons(container)[0];
			expect(icon?.className).toBe('url-preview__favicon');
			expect(icon?.alt).toBe('');
		});

		it('does not build a pill when the service returns no icon', () => {
			const stub = new FakeFaviconService();
			stub.getFaviconIconUrl = () => null;
			container.innerHTML = '<a href="https://example.com/page">x</a>';
			run(createProcessor(stub, { previewStyle: 'favicon' }), container);

			expect(pills(container)).toHaveLength(0);
			// Anchor left fully intact.
			expect(container.querySelector('a')?.getAttribute('href')).toBe('https://example.com/page');
		});
	});

	describe('idempotency', () => {
		it('does not double-pill already-enriched links on a second pass', () => {
			container.innerHTML = '<a href="https://example.com/page">x</a>';
			const processor = createProcessor(service, { previewStyle: 'favicon' });

			run(processor, container);
			const firstPassPills = pills(container);
			expect(firstPassPills).toHaveLength(1);

			run(processor, container);
			expect(pills(container)).toHaveLength(1);
			expect(pills(container)[0]).toBe(firstPassPills[0]);
		});

		it('does not re-pill a bare URL nested in a re-rendered subtree', () => {
			container.innerHTML = '<p>see https://example.com/page here</p>';
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
