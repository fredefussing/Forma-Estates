import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";

// server deps to bundle to reduce openat(2) syscalls
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

console.log("NODE VERSION:", process.version);
console.log("BUILD START");

async function buildAll() {
  try {
    await rm("dist", { recursive: true, force: true });

    console.log("building client...");
    await viteBuild();

    console.log("building server...");

    const pkg = JSON.parse(await readFile("package.json", "utf-8"));

    const allDeps = [
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.devDependencies || {}),
    ];

    const externals = allDeps.filter((dep) => !allowlist.includes(dep));

    console.log("EXTERNALS:", externals);

    await esbuild({
      entryPoints: ["server/index.ts"],
      platform: "node",
      bundle: true,
      format: "cjs",
      outfile: "dist/index.cjs",
      define: {
        "process.env.NODE_ENV": '"production"',
      },
      minify: true,
      external: externals,
      logLevel: "verbose",
    });

    console.log("BUILD FINISHED SUCCESSFULLY");
  } catch (err) {
    console.error("BUILD FAILED:");
    console.error(err);
    process.exit(1);
  }
}

buildAll();