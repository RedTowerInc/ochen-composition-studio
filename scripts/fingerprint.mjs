import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const walk = async (directory) => {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = directory + "/" + entry.name;
    if (entry.isDirectory()) result.push(...(await walk(name)));
    else if (entry.isFile()) result.push(name);
  }
  return result;
};
const files = [
  ...(await walk("src")),
  ...(await walk("public")),
  "package.json",
  "package-lock.json",
  "index.html",
  "vite.config.ts",
  "tsconfig.json",
  ".openai/hosting.json",
].sort();
const entries = await Promise.all(
  files.map(async (file) => ({
    file,
    sha256: createHash("sha256")
      .update(await readFile(file))
      .digest("hex"),
  })),
);
const fingerprint = createHash("sha256")
  .update(entries.map((entry) => entry.file + "\0" + entry.sha256).join("\n"))
  .digest("hex");
await mkdir("verification", { recursive: true });
await writeFile(
  "verification/source-fingerprint.json",
  JSON.stringify(
    { algorithm: "sha256(file names + sha256 content)", fingerprint, entries },
    null,
    2,
  ) + "\n",
);
console.log(JSON.stringify({ fingerprint, files: entries.length }));
