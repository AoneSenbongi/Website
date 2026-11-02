import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, copyFile, readdir, rm, writeFile } from "node:fs/promises";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.resolve(root, "dist");
if (
  path.dirname(output) !== path.resolve(root) ||
  path.basename(output) !== "dist"
)
  throw Error("Invalid build directory");
// Only this generated directory is removed; the local DB, originals and repository stay outside it.
await rm(output, { recursive: true, force: true });
// Repository metadata, tests, Worker source and secrets never enter the asset directory.
const tracked = execFileSync("git", ["ls-files", "-z"], {
  cwd: root,
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);
const allowed = tracked
  .filter((p) => existsSync(path.join(root, p)))
  .filter((p) =>
    /^(?:index\.html|404\.html|robots\.txt|sitemap\.xml|(?:blog|diary|contact|css|en|images|js|project|research)\/.*\.(?:html|css|js|png|jpg|jpeg|webp|ico|svg|pdf))$/.test(
      p,
    ),
  );
for (const name of allowed) {
  const target = path.join(root, "dist", name);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(path.join(root, name), target);
}
for (const name of await readdir(path.join(root, "blog-ui"))) {
  if (!/^[a-z-]+\.(?:js|css)$/.test(name)) continue;
  await mkdir(path.join(root, "dist", "blog-ui"), { recursive: true });
  await copyFile(
    path.join(root, "blog-ui", name),
    path.join(root, "dist", "blog-ui", name),
  );
}
console.log(`Built ${allowed.length} public files and Blog UI assets.`);
await build({
  entryPoints: [path.join(root, "worker/pages-entry.mjs")],
  outfile: path.join(output, "_worker.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
});
await writeFile(path.join(output, "_routes.json"), JSON.stringify({
  version: 1,
  include: ["/blog", "/blog/*", "/diary", "/diary/*", "/admin", "/admin/*", "/api/*", "/media/*"],
  exclude: [],
}, null, 2));
