// TODO: Run after Supabase setup:
// npx supabase gen types typescript --project-id YOUR_ID > src/types/database.types.ts

export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};
