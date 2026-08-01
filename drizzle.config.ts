import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Prefer the direct (unpooled) URL injected by managed-Postgres
    // integrations — drizzle-kit is unreliable over transaction pooling.
    url:
      process.env.DATABASE_URL_UNPOOLED ??
      process.env.DATABASE_URL ??
      "postgres://sodalis:sodalis@localhost:5432/sodalis",
  },
});
