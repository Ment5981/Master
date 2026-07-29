type D1Database = import("@cloudflare/workers-types").D1Database;

interface Fetcher {
  fetch(request: Request): Promise<Response>;
}
