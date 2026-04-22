#!/usr/bin/env node
/**
 * Generate version files from the latest git tag
 * Updates:
 *   - backend/src/version.ts
 *   - frontend/src/version.ts
 *   - docker-compose.yml (image tags)
 *
 * Reads version from: git describe --tags --match "v*.*.*" --abbrev=0
 * Falls back to: git describe --tags --always (for any tag or commit hash)
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function getVersion() {
  try {
    // Try to get the latest v*.*.* tag
    const version = execSync('git describe --tags --match "v*.*.*" --abbrev=0', {
      encoding: "utf-8",
      cwd: path.join(__dirname, ".."),
    }).trim();
    return version.startsWith("v") ? version.slice(1) : version;
  } catch (e) {
    // Fallback to any tag or commit hash
    try {
      const version = execSync("git describe --tags --always", {
        encoding: "utf-8",
        cwd: path.join(__dirname, ".."),
      }).trim();
      return version.startsWith("v") ? version.slice(1) : version;
    } catch (e2) {
      throw new Error(
        "No git tags found. Create a tag with: git tag v0.14.0",
      );
    }
  }
}

const version = getVersion();

// Generate backend version file
const backendVersionFile = path.join(
  __dirname,
  "..",
  "backend",
  "src",
  "version.ts",
);
const backendVersionContent = `// Auto-generated from git tag - do not edit
export const VERSION = '${version}';\n`;
fs.writeFileSync(backendVersionFile, backendVersionContent);
console.log(`Generated ${backendVersionFile}`);

// Generate frontend version file
const frontendVersionFile = path.join(
  __dirname,
  "..",
  "frontend",
  "src",
  "version.ts",
);
const frontendVersionContent = `// Auto-generated from git tag - do not edit
export const VERSION = '${version}';\n`;
fs.writeFileSync(frontendVersionFile, frontendVersionContent);
console.log(`Generated ${frontendVersionFile}`);

// Update docker-compose.yml image tags
const dockerComposeFile = path.join(__dirname, "..", "docker-compose.yml");
let dockerComposeContent = fs.readFileSync(dockerComposeFile, "utf-8");
dockerComposeContent = dockerComposeContent.replace(
  /image: homelab-monitor-backend:[^\n]+/,
  `image: homelab-monitor-backend:${version}`,
);
dockerComposeContent = dockerComposeContent.replace(
  /image: homelab-monitor-frontend:[^\n]+/,
  `image: homelab-monitor-frontend:${version}`,
);
fs.writeFileSync(dockerComposeFile, dockerComposeContent);
console.log(`Updated ${dockerComposeFile} image tags`);

console.log(`Version: ${version}`);


