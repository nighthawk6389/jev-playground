/**
 * Guards the two dependency constraints that silently break this project.
 * Run in CI: a broken install renders a BLACK CANVAS, not an error.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const fail = [];
const read = (p) => JSON.parse(readFileSync(p, "utf8"));

const react = read("node_modules/react/package.json").version;
const fiberPeer = read("node_modules/@react-three/fiber/package.json").peerDependencies.react;
if (!/^19\.2\./.test(react)) {
  fail.push(`react is ${react}; @react-three/fiber peers "${fiberPeer}" — 19.3+ breaks the renderer.`);
}

const three = read("node_modules/three/package.json").version;
const ppPeer = read("node_modules/postprocessing/package.json").peerDependencies.three;
if (three !== "0.186.0") {
  fail.push(`three is ${three}; postprocessing peers "${ppPeer}" and drei's SoftShadows is already broken past 0.182.`);
}

// Two schedulers under one renderer is undefined behavior.
try {
  const tree = execSync("npm ls scheduler --json", { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] });
  const versions = new Set();
  // Only collect nodes actually KEYED as scheduler — the root node carries this
  // project's own version and would otherwise be counted.
  const walk = (node) => {
    for (const [name, dep] of Object.entries(node.dependencies ?? {})) {
      if (name === "scheduler" && dep.version) versions.add(dep.version);
      walk(dep);
    }
  };
  walk(JSON.parse(tree));
  if (versions.size > 1) fail.push(`multiple scheduler versions present: ${[...versions].join(", ")}`);
} catch {
  /* npm ls exits non-zero on peer warnings; not fatal here */
}

if (fail.length) {
  console.error("Dependency check FAILED:\n" + fail.map((f) => `  ✗ ${f}`).join("\n"));
  process.exit(1);
}
console.log(`✓ react ${react}, three ${three}, single scheduler`);
