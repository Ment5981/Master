import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.master.time",
  appName: "Master",
  webDir: "dist",
  server: {
    // V1 keeps the existing D1/API path. A later native-bundle milestone can
    // replace this with local assets plus an explicit API origin.
    url:
      process.env.MASTER_CAPACITOR_SERVER_URL ??
      "https://master-validation.hxp332708.chatgpt.site",
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
