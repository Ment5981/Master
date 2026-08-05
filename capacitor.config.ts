import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.master.time",
  appName: "Master",
  webDir: "dist",
  server: {
    // V1 uses a hosted API origin. A later native-bundle milestone can replace
    // this with local assets plus the same explicit API origin.
    url:
      process.env.MASTER_CAPACITOR_SERVER_URL ??
      "https://master.xuanshu.fun",
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
