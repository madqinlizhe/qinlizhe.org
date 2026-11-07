import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildEnglish } from "./english.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "output/qinlizhe-en-preview");
const posts = await buildEnglish({ out, preview: true });
console.log(`Built ${posts.length} English preview pieces: ${out}/index.html`);
