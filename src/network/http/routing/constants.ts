/** Validates param/wildcard names in route paths (`:name`, `*name`) — must be a JS identifier. */
export const IDENT_REGEX = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;