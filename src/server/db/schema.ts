import { sql } from "drizzle-orm";
import {
  pgTableCreator,
  text,
  timestamp,
  varchar,
  primaryKey,
  boolean,
} from "drizzle-orm/pg-core";

/**
 * This is an example of how to use the multi-project schema feature of Drizzle ORM. Use the same
 * database instance for multiple projects.
 *
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const createTable = pgTableCreator((name) => `gitdiagram_${name}`);

export const diagramCache = createTable(
  "diagram_cache",
  {
    username: varchar("username", { length: 256 }).notNull(),
    repo: varchar("repo", { length: 256 }).notNull(),
    diagram: text("diagram").notNull(),
    explanation: text("explanation")
      .notNull()
      .default("No explanation provided"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).$onUpdate(
      () => new Date(),
    ),
    usedOwnKey: boolean("used_own_key").default(false),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.username, table.repo] }),
  }),
);

export const subDiagramCache = createTable(
  "sub_diagram_cache",
  {
    username: varchar("username", { length: 256 }).notNull(),
    repo: varchar("repo", { length: 256 }).notNull(),
    scopePath: varchar("scope_path", { length: 1024 }).notNull(),
    diagram: text("diagram").notNull(),
    explanation: text("explanation").notNull(),
    isLeaf: boolean("is_leaf").default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).$onUpdate(
      () => new Date(),
    ),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.username, table.repo, table.scopePath],
    }),
  }),
);
