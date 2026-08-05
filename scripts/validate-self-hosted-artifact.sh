#!/usr/bin/env bash
set -euo pipefail

project_root="${SITES_PROJECT_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
worker="${project_root}/dist/server/index.js"
client="${project_root}/dist/client"

[[ -f "${worker}" ]] || {
  echo "Missing self-hosted server entry: dist/server/index.js" >&2
  exit 66
}
[[ -d "${client}" ]] || {
  echo "Missing self-hosted client assets: dist/client" >&2
  exit 66
}

node --input-type=module - "${worker}" <<'NODE'
import { pathToFileURL } from "node:url";

const [serverPath] = process.argv.slice(2);
const moduleUrl = pathToFileURL(serverPath);
moduleUrl.searchParams.set("self-hosted-validation", `${process.pid}-${Date.now()}`);
const server = await import(moduleUrl.href);
if (!server.default || (typeof server.default !== "function" && typeof server.default.fetch !== "function")) {
  throw new Error("dist/server/index.js must export a Node handler or Worker-style fetch handler");
}
NODE

echo "Validated self-hosted artifact: server entry and client assets are present."
