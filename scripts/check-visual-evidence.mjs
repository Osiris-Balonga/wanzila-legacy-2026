import { execFileSync } from "node:child_process";

const { PR_BASE_SHA, PR_HEAD_SHA, PR_BODY = "" } = process.env;

if (
  !/^[0-9a-f]{40}$/.test(PR_BASE_SHA ?? "") ||
  !/^[0-9a-f]{40}$/.test(PR_HEAD_SHA ?? "")
) {
  throw new Error("PR_BASE_SHA and PR_HEAD_SHA must be full commit SHAs.");
}

const changedFiles = execFileSync(
  "git",
  ["diff", "--name-only", `${PR_BASE_SHA}...${PR_HEAD_SHA}`],
  { encoding: "utf8" },
)
  .trim()
  .split(/\r?\n/);

const uiFiles = changedFiles.filter((path) =>
  /^apps\/web\/(?:src\/.*\.(?:tsx|css)|public\/.*)$/.test(path),
);

if (uiFiles.length === 0) {
  console.log("No web UI files changed; visual evidence is not required.");
  process.exit(0);
}

const fields = [
  "Layout reference",
  "Implementation capture",
  "Material deviations",
  "Responsive and interaction proof",
];

const missing = fields.filter((field) => {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = PR_BODY.match(
    new RegExp(`^${escaped}:([^\\n]*(?:\\n(?![A-Z][^\\n]*:|## ).*)*)`, "im"),
  );
  if (!match) return true;
  const value = match[1]
    .replace(/<!--[^]*?-->/g, "")
    .replace(/[\s\-*`]/g, "")
    .trim();
  return value.length === 0;
});

if (missing.length > 0) {
  throw new Error(
    `Web UI PR lacks visual evidence: ${missing.join(", ")}. See docs/design/README.md.`,
  );
}

console.log(
  `Visual evidence fields present for ${uiFiles.length} web UI file(s).`,
);
