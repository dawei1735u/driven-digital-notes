import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env" });

const requiredPublic = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
];

const optionalServer = ["SUPABASE_SERVICE_ROLE_KEY", "LOVABLE_API_KEY"];

function mask(value) {
  if (!value) return "missing";
  if (value.includes("paste from") || value.length < 40) return "invalid placeholder/too short";
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function reportEnv() {
  console.log("Local environment check\n");
  for (const name of requiredPublic) {
    const value = process.env[name];
    console.log(`${value ? "✓" : "✗"} ${name}: ${mask(value)}`);
  }
  for (const name of optionalServer) {
    const value = process.env[name];
    console.log(`${value && !mask(value).includes("invalid") ? "✓" : "!"} ${name}: ${mask(value)}`);
  }
}

async function main() {
  reportEnv();

  const url = process.env.VITE_SUPABASE_URL;
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    console.error("\nMissing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY.");
    process.exit(1);
  }

  const supabase = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { count, error } = await supabase
    .from("notes")
    .select("id", { count: "exact", head: true });

  if (error) {
    console.log("\nConnected to the backend, but notes are not readable without a signed-in, approved user.");
    console.log(`Backend response: ${error.message}`);
    console.log("\nNext step: run the app locally, sign in with your approved account, and open /monitor.");
    return;
  }

  console.log(`\n✓ Anonymous notes query returned ${count ?? 0} rows.`);
  console.log("If your app still shows no records, check the Monitor filters: status defaults to Open and your signed-in user's workspace must match the notes.");
}

main().catch((err) => {
  console.error("\nLocal setup check failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});