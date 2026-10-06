export const CONTENT_HASH_REGEX = /\.[a-f0-9]{8,}\.(js|css|png|jpg|svg|woff2)$/i;

export const CacheDirective = {
    NO_STORE: "no-store",
    NO_CACHE: "no-cache",
    STATIC_DEFAULT: "public, max-age=3600, must-revalidate",
    IMMUTABLE: "public, max-age=31536000, immutable",
    LONG_LIVED: "public, max-age=86400"
} as const;

export type CacheDirectiveType = typeof CacheDirective[keyof typeof CacheDirective];

export const EXTENSION_CACHE_MAP: Record<string, CacheDirectiveType> = {
    ".html": CacheDirective.NO_CACHE,
    ".htm":  CacheDirective.NO_CACHE,

    ".css":  CacheDirective.STATIC_DEFAULT,
    ".js":   CacheDirective.STATIC_DEFAULT,
    ".mjs":  CacheDirective.STATIC_DEFAULT,
    ".json": CacheDirective.STATIC_DEFAULT,

    ".png":  CacheDirective.LONG_LIVED,
    ".jpg":  CacheDirective.LONG_LIVED,
    ".jpeg": CacheDirective.LONG_LIVED,
    ".svg":  CacheDirective.LONG_LIVED,
    ".webp": CacheDirective.LONG_LIVED,
    ".woff2":CacheDirective.LONG_LIVED,
};
