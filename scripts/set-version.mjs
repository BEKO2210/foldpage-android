#!/usr/bin/env node
/** One command for a release number, because it lives in three files.
 *
 *  `android/app/build.gradle` decides what Play sees, `package.json` carries
 *  the same number for anyone reading the repository, and the README's status
 *  line is what a person actually looks at. They have drifted apart twice: a
 *  build went out as 1.5 while the README still said 1.4, and an upload was
 *  refused because versionCode 7 was already spent.
 *
 *    node scripts/set-version.mjs 1.8          # versionCode + 1
 *    node scripts/set-version.mjs 1.8 --code 12
 *    node scripts/set-version.mjs --check      # report, change nothing
 *
 *  versionCode only ever goes up: once a bundle carrying it sits in the Play
 *  Console, that number is spent for good.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const GRADLE = path.join(ROOT, "android", "app", "build.gradle");
const PACKAGE = path.join(ROOT, "package.json");
const README = path.join(ROOT, "README.md");

const args = process.argv.slice(2);
const check = args.includes("--check");
const name = args.find((arg) => /^\d+\.\d+(\.\d+)?$/.test(arg));
const codeAt = args.indexOf("--code");
const explicitCode = codeAt === -1 ? null : Number(args[codeAt + 1]);

const gradle = fs.readFileSync(GRADLE, "utf8");
const current = {
  code: Number(gradle.match(/versionCode\s+(\d+)/)?.[1]),
  name: gradle.match(/versionName\s+"([^"]+)"/)?.[1],
  package: JSON.parse(fs.readFileSync(PACKAGE, "utf8")).version,
  readme: fs.readFileSync(README, "utf8").match(/^Version (\d+\.\d+(?:\.\d+)?)/m)?.[1],
};

if (check || !name) {
  const agree =
    current.name === current.readme &&
    current.package.replace(/\.0$/, "") === current.name;
  console.log(
    JSON.stringify(
      { ...current, inAgreement: agree },
      null,
      2
    )
  );
  if (!name && !check) {
    console.error("\nUsage: node scripts/set-version.mjs <versionName> [--code N]");
    process.exitCode = 1;
  } else if (!agree) {
    console.error("\nThe three files disagree. Run with a version to line them up.");
    process.exitCode = 1;
  }
  process.exit(process.exitCode ?? 0);
}

const code = explicitCode ?? current.code + 1;
if (!Number.isInteger(code) || code <= current.code) {
  console.error(
    `versionCode must rise: ${current.code} is in use, ${code} was asked for. ` +
      "A code that has carried a bundle into the Play Console cannot be reused."
  );
  process.exit(1);
}

const packageVersion = /^\d+\.\d+\.\d+$/.test(name) ? name : `${name}.0`;

fs.writeFileSync(
  GRADLE,
  gradle
    .replace(/versionCode\s+\d+/, `versionCode ${code}`)
    .replace(/versionName\s+"[^"]+"/, `versionName "${name}"`)
);

const pkg = JSON.parse(fs.readFileSync(PACKAGE, "utf8"));
pkg.version = packageVersion;
fs.writeFileSync(PACKAGE, `${JSON.stringify(pkg, null, 2)}\n`);

const readme = fs.readFileSync(README, "utf8");
const replaced = readme.replace(/^Version \d+\.\d+(?:\.\d+)?/m, `Version ${name}`);
if (replaced === readme) {
  console.error(
    "The README has no line starting with 'Version x.y' — status line not updated."
  );
  process.exitCode = 1;
}
fs.writeFileSync(README, replaced);

console.log(
  `${current.name} (code ${current.code})  ->  ${name} (code ${code})\n` +
    "  android/app/build.gradle, package.json, README.md\n" +
    "Next: npm test && npm run corpus && npm run reader-render, then build."
);
