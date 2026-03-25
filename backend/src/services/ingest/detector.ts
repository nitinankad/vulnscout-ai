import { promises as fs } from 'fs';
import path from 'path';

export interface DetectionResult {
  hasDockerfile: boolean;
  hasDockerCompose: boolean;
  hasYarnLock: boolean;
  hasPnpmLock: boolean;
  port: number;
  startCommand: string;
  packageJson: Record<string, unknown>;
}

/**
 * Inspects a cloned Node.js repo directory and returns everything
 * needed to generate a Dockerfile or drive the build.
 */
export async function detectNode(repoDir: string): Promise<DetectionResult> {
  const entries = await fs.readdir(repoDir);
  const fileSet = new Set(entries.map((f) => f.toLowerCase()));

  const hasDockerfile = fileSet.has('dockerfile');
  const hasDockerCompose = fileSet.has('docker-compose.yml') || fileSet.has('docker-compose.yaml');
  const hasYarnLock = fileSet.has('yarn.lock');
  const hasPnpmLock = fileSet.has('pnpm-lock.yaml');

  // Parse package.json
  let packageJson: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(path.join(repoDir, 'package.json'), 'utf-8');
    packageJson = JSON.parse(raw);
  } catch {
    // proceed with empty object
  }

  // Determine start command from scripts
  const scripts = (packageJson.scripts ?? {}) as Record<string, string>;
  let startCommand = 'node index.js';
  if (scripts['start']) {
    startCommand = 'npm start';
  } else if (scripts['serve']) {
    startCommand = 'npm run serve';
  }

  // Detect port — scan env defaults commonly used in Node apps
  let port = 3000;
  const mainField = (packageJson.main as string | undefined) ?? '';
  // Try reading the main file for a PORT hint (best-effort)
  if (mainField) {
    try {
      const mainSrc = await fs.readFile(path.join(repoDir, mainField), 'utf-8');
      const match = mainSrc.match(/process\.env\.PORT[^|]*\|\|\s*['"]?(\d{2,5})['"]?/);
      if (match) port = parseInt(match[1], 10);
    } catch {
      // ignore — default is fine
    }
  }

  return { hasDockerfile, hasDockerCompose, hasYarnLock, hasPnpmLock, port, startCommand, packageJson };
}

/**
 * Quick check that a directory looks like a Node.js project.
 */
export async function isNodeProject(repoDir: string): Promise<boolean> {
  try {
    await fs.access(path.join(repoDir, 'package.json'));
    return true;
  } catch {
    return false;
  }
}
