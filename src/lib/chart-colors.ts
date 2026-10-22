// Validated reference palette (categorical slots in fixed order; status colors reserved for states).
// Kept in a plain module so both server and client components get real values.
export const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a'] as const;
export const STATUS_COLORS = { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b', neutral: '#94a3b8' } as const;
