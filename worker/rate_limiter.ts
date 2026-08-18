import { DurableObject } from "cloudflare:workers";

const WINDOW_MS = 60_000;
const LIMIT = 30;

export class RateLimiter extends DurableObject {
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS rate_windows (id INTEGER PRIMARY KEY, window_start INTEGER NOT NULL, count INTEGER NOT NULL)"
    );
  }

  async fetch(request: Request): Promise<Response> {
    const now = Date.now();
    const row = this.ctx.storage.sql
      .exec("SELECT window_start, count FROM rate_windows WHERE id = 1")
      .one<{ window_start: number; count: number }>();

    if (!row || now - row.window_start >= WINDOW_MS) {
      this.ctx.storage.sql.exec(
        "INSERT OR REPLACE INTO rate_windows (id, window_start, count) VALUES (1, ?, 1)",
        now
      );
      return Response.json({ allowed: true, remaining: LIMIT - 1, limit: LIMIT });
    }

    const next = row.count + 1;
    this.ctx.storage.sql.exec("UPDATE rate_windows SET count = ? WHERE id = 1", next);
    return Response.json({
      allowed: next <= LIMIT,
      remaining: Math.max(0, LIMIT - next),
      limit: LIMIT,
      retry_after: Math.ceil((WINDOW_MS - (now - row.window_start)) / 1000),
    });
  }
}
