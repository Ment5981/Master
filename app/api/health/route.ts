export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    ok: true,
    runtime: process.env.MASTER_SELF_HOSTED === "1" ? "self-hosted" : "cloudflare",
  });
}
