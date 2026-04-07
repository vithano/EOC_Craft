export interface UniqueModsAuditAllowlistEntry {
  /** Case-insensitive regex tested against the resolved line text. */
  re: RegExp
  /** Why this line is intentionally not implemented mechanically. */
  reason: string
}

/**
 * Lines that are currently intentionally NOT modeled in planner stats or battle sim.
 *
 * Keep this list small and high-signal: anything that should affect combat numbers
 * should be implemented instead of allowlisted.
 */
export const UNIQUE_MODS_AUDIT_ALLOWLIST: UniqueModsAuditAllowlistEntry[] = []

