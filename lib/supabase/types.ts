/**
 * Generated types placeholder.
 *
 * After Phase 1 migrations run, regenerate with:
 *   pnpm db:types
 *
 * Until then, this minimal shape lets the rest of the codebase type-check.
 */

export type Database = {
  public: {
    Tables: Record<string, { Row: unknown; Insert: unknown; Update: unknown }>;
    Views: Record<string, { Row: unknown }>;
    Functions: Record<string, unknown>;
    Enums: Record<string, unknown>;
  };
};
