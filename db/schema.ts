import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const dailySnapshots = sqliteTable(
  "daily_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tradeDate: text("trade_date").notNull(),
    payload: text("payload").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("idx_daily_snapshots_trade_date").on(table.tradeDate)],
);
