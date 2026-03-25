import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import simpleGit from 'simple-git';
import { detectNode, isNodeProject } from './detector';
import { generateNodeDockerfile, generateDockerignore } from './dockerfiles';
import { buildDockerImage } from './builder';
import { emitEvent } from '../../lib/events';

export interface IngestOptions {
  repoUrl: string;
  branch?: string | null;
  githubToken?: string | null;
  scanId: string;
}

export interface IngestResult {
  imageTag: string;
  repoDir: string;
  port: number;
}

/**
 * Full ingest pipeline:
 *   1. Clone the GitHub repo
 *   2. Detect Node.js project structure
 *   3. Write a Dockerfile (+ .dockerignore) if none exists
 *   4. Build the Docker image and stream logs
 */
export async function ingestRepo(options: IngestOptions): Promise<IngestResult> {
  const { repoUrl, branch, githubToken, scanId } = options;

  const repoDir = path.join(os.tmpdir(), `vulnscout-${scanId}`);
  await fs.rm(repoDir, { recursive: true, force: true });
  await fs.mkdir(repoDir, { recursive: true });

  // ── 1. Clone ────────────────────────────────────────────────────────────────
  const cloneUrl = buildCloneUrl(repoUrl, githubToken ?? undefined);
  await emitEvent(scanId, 'info', `Cloning ${repoUrl}${branch ? ` (${branch})` : ''}…`);

  const cloneArgs: string[] = ['--depth', '1'];
  if (branch) cloneArgs.push('--branch', branch);

  await simpleGit().clone(cloneUrl, repoDir, cloneArgs);
  await emitEvent(scanId, 'success', 'Repository cloned');

  // ── 2. Detect ───────────────────────────────────────────────────────────────
  const isNode = await isNodeProject(repoDir);
  if (!isNode) {
    throw new Error('Only Node.js projects are supported at this time');
  }

  const detection = await detectNode(repoDir);
  await emitEvent(scanId, 'info', `Detected: Node.js · port ${detection.port}`);

  // ── 3. Dockerfile ───────────────────────────────────────────────────────────
  if (!detection.hasDockerfile) {
    await emitEvent(scanId, 'info', 'No Dockerfile found — generating one');
    const dockerfile = generateNodeDockerfile(detection);
    await fs.writeFile(path.join(repoDir, 'Dockerfile'), dockerfile, 'utf-8');
    await fs.writeFile(path.join(repoDir, '.dockerignore'), generateDockerignore(), 'utf-8');
    await emitEvent(scanId, 'success', 'Dockerfile generated');
  } else {
    await emitEvent(scanId, 'info', 'Using existing Dockerfile');
  }

  // ── 4. Build image ──────────────────────────────────────────────────────────
  const imageTag = `vulnscout-scan-${scanId}:latest`;
  await buildDockerImage(repoDir, imageTag, scanId);

  return { imageTag, repoDir, port: detection.port };
}

/**
 * Normalises a repo URL and injects the GitHub PAT for authenticated cloning.
 * Accepts formats: https://github.com/org/repo, github.com/org/repo, org/repo
 */
function buildCloneUrl(repoUrl: string, token?: string): string {
  let host = repoUrl
    .replace(/^https?:\/\//, '')
    .replace(/\.git$/, '');

  if (!host.startsWith('github.com/')) {
    host = `github.com/${host}`;
  }

  if (token) {
    return `https://${token}@${host}.git`;
  }
  return `https://${host}.git`;
}
