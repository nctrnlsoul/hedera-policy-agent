// Coverage audit: how many tools this agent exposes, and how many of them the
// policy layer actually governs. Run with `npm run coverage`.
//
// The governed tool names are read from the policy classes themselves, so this
// script cannot drift from the code it audits. The plugin list is read out of
// shared/config.js as text rather than imported, because config.js requires
// live environment variables and builds a network client at module scope.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as plugins from "@hashgraph/hedera-agent-kit/plugins";
import { TimeWindowPolicy } from "../shared/policies/time-window-policy.js";
import { TransferSizeLimitPolicy } from "../shared/policies/transfer-size-policy.js";

const CONFIG_PATH = fileURLToPath(new URL("../shared/config.js", import.meta.url));

// Tools that move value or grant spending authority. Used only to sort the
// ungoverned list so the interesting names surface first.
const RISKY =
  /transfer|airdrop|allowance|approve|delete|mint|burn|wipe|freeze|pause|update|create|dissociate|reject|claim|sign|submit/i;

const governed = new Set([
  ...new TimeWindowPolicy().relevantTools,
  ...new TransferSizeLimitPolicy().relevantTools,
]);

let total = 0;
let governedCount = 0;
const ungoverned = [];

for (const name of readPluginNames(CONFIG_PATH)) {
  const plugin = plugins[name];
  if (!plugin) {
    throw new Error(`shared/config.js wires "${name}" but the kit does not export it.`);
  }
  const tools = typeof plugin.tools === "function" ? plugin.tools({}) : (plugin.tools ?? []);
  const ids = tools.map((tool) => tool?.method ?? tool?.name ?? "?");

  console.log(`--- ${name}  (${ids.length})`);
  for (const id of ids) {
    const isGoverned = governed.has(id);
    if (isGoverned) governedCount += 1;
    else ungoverned.push(id);
    console.log(`    ${isGoverned ? "GOVERNED  " : "          "}${id}`);
  }
  total += ids.length;
}

console.log("");
console.log(`TOOLS EXPOSED : ${total}`);
console.log(`GOVERNED      : ${governedCount}`);
console.log(`UNGOVERNED    : ${ungoverned.length}`);
console.log("");
console.log("Ungoverned tools that move value or grant authority:");

const risky = ungoverned.filter((tool) => RISKY.test(tool));
if (risky.length === 0) console.log("    none");
else for (const tool of risky) console.log(`    ${tool}`);

/**
 * Reads the wired plugin names out of shared/config.js. Throws rather than
 * returning an empty list, because a silent zero here would report full
 * coverage of nothing.
 */
function readPluginNames(path) {
  const source = readFileSync(path, "utf8");
  const block = source.match(/export const plugins\s*=\s*\[([^\]]*)\]/);
  if (!block) {
    throw new Error("Could not find the `export const plugins = [...]` block in shared/config.js.");
  }
  const names = block[1]
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (names.length === 0) throw new Error("The plugins block in shared/config.js is empty.");
  return names;
}
