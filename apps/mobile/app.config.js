// Expo dynamic config — merges app.json with env-driven overrides.
// This lets EAS builds inject env vars without hardcoding in source.
module.exports = ({ config }) => {
  const SUPABASE_URL =
    process.env.EXPO_PUBLIC_SUPABASE_URL ||
    "https://athkmrvsaijwgsyvwrbp.supabase.co";
  const SUPABASE_ANON_KEY =
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0aGttcnZzYWlqd2dzeXZ3cmJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2NjM4NDQsImV4cCI6MjEwMTIzOTg0NH0.QAT0gZBJl-ELFG8221MRZoZoTj0La9_TOXFXx-HiKbY";

  return {
    ...config,
    name: config.name || "ChinaSuuq",
    extra: {
      ...config.extra,
      supabaseUrl: SUPABASE_URL,
      supabaseAnonKey: SUPABASE_ANON_KEY,
    },
  };
};
