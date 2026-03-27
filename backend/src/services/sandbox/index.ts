import Dockerode from 'dockerode';
import { emitEvent } from '../../lib/events';
import { findFreePort } from './ports';
import { parseDockerCompose, type ParsedDependency } from './compose';

const docker = new Dockerode();

const HEALTH_CHECK_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes
const HEALTH_CHECK_INTERVAL_MS = 2000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SandboxOptions {
  scanId: string;
  imageTag: string;
  port: number;
  repoDir: string;
  envVars?: Record<string, string>;
  healthPath?: string; // defaults to /health
}

export interface SandboxContext {
  networkId: string;
  networkName: string;
  targetContainerId: string;
  targetBaseUrl: string; // http://localhost:{hostPort} — reachable from this process
  depContainerIds: string[];
  imageTag: string;
  port: number;
  hostPort: number;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Spins up a fully isolated sandbox for one scan:
 *  1. Creates a dedicated Docker bridge network
 *  2. Starts dependency containers (postgres, redis, etc.) on that network
 *  3. Starts the target container with a host port binding
 *  4. Polls the health endpoint until the service is ready
 */
export async function startSandbox(options: SandboxOptions): Promise<SandboxContext> {
  const { scanId, imageTag, port, repoDir, envVars = {}, healthPath = '/health' } = options;
  const networkName = `sandbox-${scanId}`;
  const depContainerIds: string[] = [];

  // 0. Verify Docker is reachable
  try {
    await docker.ping();
  } catch {
    throw new Error(
      'Docker is not available. Please start Docker Desktop and retry the scan.',
    );
  }

  // 1. Isolated bridge network — remove any leftover from a previous failed run first
  await pruneLeftovers(scanId, networkName);
  await emitEvent(scanId, 'info', `Creating sandbox network: ${networkName}`);
  const network = await docker.createNetwork({
    Name: networkName,
    Driver: 'bridge',
    // Note: Internal:true prevents outbound internet from the sandbox.
    // We keep it false here so the host port binding is still reachable;
    // in production add explicit iptables egress rules instead.
    Labels: { 'vulnscout.scan_id': scanId },
  });
  await emitEvent(scanId, 'success', `Network ready: ${networkName}`);

  // 2. Dependency containers
  const compose = await parseDockerCompose(repoDir);
  if (compose?.dependencies.length) {
    for (const dep of compose.dependencies) {
      const id = await startDependency(scanId, dep, networkName);
      depContainerIds.push(id);
    }
    // Brief pause so deps (especially postgres) can finish init before the app starts
    await new Promise((r) => setTimeout(r, 3000));
  }

  // 3. Target container
  const hostPort = await findFreePort();
  await emitEvent(scanId, 'info', `Starting target on host port ${hostPort}…`);

  const target = await docker.createContainer({
    Image: imageTag,
    name: `vulnscout-target-${scanId}`,
    Env: [
      `PORT=${port}`,
      `NODE_ENV=production`,
      ...Object.entries(envVars).map(([k, v]) => `${k}=${v}`),
    ],
    ExposedPorts: { [`${port}/tcp`]: {} },
    HostConfig: {
      NetworkMode: networkName,
      PortBindings: {
        [`${port}/tcp`]: [{ HostIp: '127.0.0.1', HostPort: String(hostPort) }],
      },
      Memory: 512 * 1024 * 1024,    // 512 MB
      CpuPeriod: 100000,
      CpuQuota: 50000,               // 0.5 CPU
      AutoRemove: false,
      RestartPolicy: { Name: 'no' },
    },
    Labels: { 'vulnscout.scan_id': scanId, 'vulnscout.role': 'target' },
  });

  await target.start();
  await emitEvent(scanId, 'success', 'Target container started');

  // Build the context now so we can always clean up, even if health check fails
  const ctx: SandboxContext = {
    networkId: network.id,
    networkName,
    targetContainerId: target.id,
    targetBaseUrl: `http://127.0.0.1:${hostPort}`,
    depContainerIds,
    imageTag,
    port,
    hostPort,
  };

  // 4. Health check — tear down on failure so nothing leaks
  try {
    await pollHealth(scanId, ctx.targetBaseUrl, healthPath);
  } catch (err) {
    await emitEvent(scanId, 'error', 'Health check failed — tearing down sandbox…');
    await teardownSandbox(ctx, scanId);
    throw err;
  }

  return ctx;
}

/**
 * Stops and removes all containers and the network for a given sandbox.
 * Safe to call even if containers are already gone.
 */
export async function teardownSandbox(context: SandboxContext, scanId: string): Promise<void> {
  await emitEvent(scanId, 'info', 'Tearing down sandbox…');

  const allIds = [context.targetContainerId, ...context.depContainerIds];
  for (const id of allIds) {
    try {
      const c = docker.getContainer(id);
      await c.stop({ t: 5 });
      await c.remove({ force: true });
    } catch {
      // Already removed or never started — fine
    }
  }

  try {
    const net = docker.getNetwork(context.networkId);
    await net.remove();
  } catch {
    // Already gone
  }

  await emitEvent(scanId, 'success', 'Sandbox torn down · all containers removed');
}

// ─── Internals ────────────────────────────────────────────────────────────────

async function startDependency(
  scanId: string,
  dep: ParsedDependency,
  networkName: string,
): Promise<string> {
  await emitEvent(scanId, 'info', `Starting dependency: ${dep.name} (${dep.image})`);

  // Pull the image if not cached locally
  await pullImageIfMissing(dep.image);

  const container = await docker.createContainer({
    Image: dep.image,
    name: `vulnscout-dep-${dep.name}-${scanId}`,
    Env: Object.entries(dep.env).map(([k, v]) => `${k}=${v}`),
    HostConfig: {
      NetworkMode: networkName,
      Memory: 256 * 1024 * 1024,
      RestartPolicy: { Name: 'no' },
    },
    Labels: { 'vulnscout.scan_id': scanId, 'vulnscout.role': 'dependency' },
  });

  await container.start();
  await emitEvent(scanId, 'success', `Dependency ready: ${dep.name}`);
  return container.id;
}

async function pullImageIfMissing(image: string): Promise<void> {
  try {
    await docker.getImage(image).inspect();
    return; // already local
  } catch {
    // Not cached — pull it
  }

  await new Promise<void>((resolve, reject) => {
    docker.pull(image, (err: Error | null, stream: NodeJS.ReadableStream) => {
      if (err) return reject(err);
      docker.modem.followProgress(stream, (err2: Error | null) => {
        if (err2) reject(err2);
        else resolve();
      });
    });
  });
}

async function pruneLeftovers(scanId: string, networkName: string): Promise<void> {
  // Remove any containers tagged with this scan ID (from a previous failed run)
  try {
    const containers = await docker.listContainers({
      all: true,
      filters: JSON.stringify({ label: [`vulnscout.scan_id=${scanId}`] }),
    });
    for (const info of containers) {
      try {
        await docker.getContainer(info.Id).remove({ force: true });
      } catch {
        // already gone
      }
    }
  } catch {
    // ignore listing errors
  }

  // Remove the network if it exists
  try {
    const networks = await docker.listNetworks({
      filters: JSON.stringify({ name: [networkName] }),
    });
    for (const info of networks) {
      if (info.Name === networkName) {
        try {
          await docker.getNetwork(info.Id).remove();
        } catch {
          // already gone or still has endpoints — force remove via containers above
        }
      }
    }
  } catch {
    // ignore
  }
}

async function pollHealth(scanId: string, baseUrl: string, healthPath: string): Promise<void> {
  const deadline = Date.now() + HEALTH_CHECK_TIMEOUT_MS;
  const url = `${baseUrl}${healthPath}`;
  await emitEvent(scanId, 'info', `Waiting for service health: ${url}`);

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      // Any HTTP response means the service is up (404 is fine — no /health route required)
      await emitEvent(scanId, 'success', `Service healthy (HTTP ${res.status})`);
      return;
    } catch (err) {
      // Network error — service not ready yet, retry
    }
    await new Promise((r) => setTimeout(r, HEALTH_CHECK_INTERVAL_MS));
  }

  throw new Error(`Service did not respond at ${url} within 2 minutes`);
}
