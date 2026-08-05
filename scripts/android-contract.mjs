import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const capacitor = readFileSync("capacitor.config.ts", "utf8");

assert.equal(packageJson.scripts["android:apk"].includes("assembleDebug"), true);
assert.equal(packageJson.scripts["android:aab"].includes("bundleRelease"), true);
assert.equal(typeof packageJson.dependencies["@capacitor/app"], "string");
assert.match(capacitor, /appId:\s*["']com\.master\.time["']/);
assert.match(capacitor, /master\.xuanshu\.fun/);
assert.match(capacitor, /cleartext:\s*false/);
assert.equal(existsSync("docs/android-acceptance.md"), true);
assert.equal(existsSync("docs/android-test-cases.md"), true);
assert.equal(existsSync("app/client-identity.ts"), true);

const sourceFiles = [
  "app/client-identity.ts",
  "app/hooks/use-workspace-persistence.ts",
  "app/api/workspace/route.ts",
  "app/master-app.tsx",
];
const source = sourceFiles.map((file) => readFileSync(file, "utf8")).join("\n");
assert.match(source, /x-master-installation-id/);
assert.doesNotMatch(source, /OPENAI_API_KEY\s*=/);
assert.match(source, /backButton/);
assert.match(source, /isNativePlatform/);
assert.match(source, /exitApp/);
console.log("android-contract: PASS");
