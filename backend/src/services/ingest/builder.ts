import Dockerode from 'dockerode';
import tar from 'tar-fs';
import { emitEvent } from '../../lib/events';

const docker = new Dockerode();

interface DockerStreamEvent {
  stream?: string;
  status?: string;
  error?: string;
  errorDetail?: { message: string };
}

/**
 * Packs the build context directory into a tar stream and builds a Docker image.
 * Streams each build log line as a scan event to Redis pub/sub.
 */
export async function buildDockerImage(
  contextDir: string,
  imageTag: string,
  scanId: string,
): Promise<void> {
  try {
    await docker.ping();
  } catch {
    throw new Error('Docker is not available. Please start Docker Desktop and retry the scan.');
  }

  await emitEvent(scanId, 'info', `Building image ${imageTag}…`);

  const tarStream = tar.pack(contextDir);
  const buildStream = await docker.buildImage(tarStream, { t: imageTag, nocache: false });

  await new Promise<void>((resolve, reject) => {
    docker.modem.followProgress(
      buildStream,
      (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      },
      async (event: DockerStreamEvent) => {
        const line = (event.stream ?? event.status ?? '').trim();
        if (line) {
          await emitEvent(scanId, 'info', `[docker] ${line}`);
        }
        if (event.error) {
          await emitEvent(scanId, 'error', `[docker] ${event.error}`);
        }
      },
    );
  });

  await emitEvent(scanId, 'success', `Image built successfully: ${imageTag}`);
}

/**
 * Removes a Docker image by tag. Called during sandbox teardown.
 */
export async function removeDockerImage(imageTag: string): Promise<void> {
  try {
    const image = docker.getImage(imageTag);
    await image.remove({ force: true });
  } catch {
    // Image may not exist — not an error
  }
}
