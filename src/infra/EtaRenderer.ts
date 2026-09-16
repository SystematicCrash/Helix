import {Eta, EtaError} from 'eta';
import {fileURLToPath} from 'url';
import {dirname, resolve} from 'path';

/**
 * Eta instance configured to load templates from src/infra/templates.
 * Resolved relative to this module so the renderer works regardless of
 * the process's current working directory.
 */
const templatesDir = resolve(
    dirname(fileURLToPath(import.meta.url)),
    'templates',
);

const eta = new Eta({
    views: templatesDir,
    cache: true,
    autoEscape: true,
});

/** Thrown when a template cannot be rendered or located. */
export default class RenderError extends Error {
    private constructor(message: string) {
        super(message);
        this.name = 'RenderError';
    }

    static from(error: unknown, template: string): RenderError {
        if (error instanceof EtaError) {
            return new RenderError(`Failed to render template "${template}"`);
        }
        if (error instanceof Error) {
            return new RenderError(error.message);
        }
        return new RenderError(`Failed to render template "${template}"`);
    }
}

/**
 * Renders an `.eta` template by name with the given data and returns the
 * result as a Buffer (UTF-8).
 *
 * The template is resolved relative to src/infra/templates/. The rendered
 * output is suitable for wrapping in a MemoryBodyReader.
 */
export function renderHtml(template: string, data: object = {}): Buffer {
    try {
        const html = eta.render(template, data);
        return Buffer.from(html, 'utf-8');
    } catch (error) {
        throw RenderError.from(error, template);
    }
}
