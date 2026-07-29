import { getChatGPTUser } from "./chatgpt-auth";
import { MasterApp } from "./master-app";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();
  return (
    <MasterApp
      user={{
        displayName: user?.displayName ?? "Master 用户",
        email: user?.email ?? "",
      }}
    />
  );
}
