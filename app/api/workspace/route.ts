import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { masterWorkspaces } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";

export const dynamic = "force-dynamic";

async function getUserKey() {
  const user = await getChatGPTUser();
  if (user?.email) return user.email;
  if (process.env.NODE_ENV === "development") return "preview@master.local";
  return null;
}

export async function GET() {
  const userKey = await getUserKey();
  if (!userKey) {
    return Response.json({ error: "请先登录后使用永久保存。" }, { status: 401 });
  }
  try {
    const db = getDb();
    const [record] = await db
      .select()
      .from(masterWorkspaces)
      .where(eq(masterWorkspaces.userKey, userKey))
      .limit(1);
    return Response.json({
      state: record ? JSON.parse(record.stateJson) : null,
      updatedAt: record?.updatedAt ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("no such table")) {
      return Response.json(
        { error: "数据空间正在初始化，请稍后重试。" },
        { status: 503 },
      );
    }
    return Response.json({ error: "暂时无法读取数据。" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const userKey = await getUserKey();
  if (!userKey) {
    return Response.json({ error: "请先登录后保存。" }, { status: 401 });
  }
  try {
    const payload = (await request.json()) as { state?: unknown };
    if (!payload.state || typeof payload.state !== "object") {
      return Response.json({ error: "保存内容无效。" }, { status: 400 });
    }
    const stateJson = JSON.stringify(payload.state);
    if (stateJson.length > 500_000) {
      return Response.json({ error: "当前目标内容过大。" }, { status: 413 });
    }
    const updatedAt = new Date().toISOString();
    const db = getDb();
    await db
      .insert(masterWorkspaces)
      .values({ userKey, stateJson, updatedAt })
      .onConflictDoUpdate({
        target: masterWorkspaces.userKey,
        set: { stateJson, updatedAt },
      });
    return Response.json({ saved: true, updatedAt });
  } catch {
    return Response.json({ error: "暂时无法保存，请稍后重试。" }, { status: 500 });
  }
}
