import * as schema from "./schema";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "dotenv";

config({ path: ".env" });

// Supabase exposes a standard Postgres connection string via the project URL
// The connection string is derived from NEXT_PUBLIC_SUPABASE_URL
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseHost = new URL(supabaseUrl).hostname;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!;

// Build Postgres connection string for Supabase
// Supabase direct connection: postgresql://postgres.[project-ref]:[password]@[host]:5432/postgres
const connectionString =
  process.env.DATABASE_URL ??
  `postgresql://postgres:${supabaseKey}@${supabaseHost}:5432/postgres`;

const client = postgres(connectionString);
const db = drizzle(client, { schema });

export { db };
