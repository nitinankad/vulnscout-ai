import { promises as fs } from 'fs';
import path from 'path';
import yaml from 'yaml';

// Images that are clearly dependency services, not the target app
const DEP_IMAGE_PREFIXES = [
  'postgres', 'mysql', 'mariadb', 'redis', 'mongo', 'rabbitmq',
  'elasticsearch', 'nginx', 'memcached', 'kafka', 'zookeeper',
  'cassandra', 'minio', 'mailhog', 'localstack',
];

export interface ComposeService {
  image?: string;
  build?: string | { context?: string; dockerfile?: string };
  environment?: Record<string, string> | string[];
  depends_on?: string[] | Record<string, unknown>;
  ports?: string[];
  volumes?: string[];
}

export interface ParsedDependency {
  name: string;
  image: string;
  env: Record<string, string>;
}

export interface ParsedCompose {
  targetServiceName: string;
  dependencies: ParsedDependency[];
}

/**
 * Reads docker-compose.yml from the repo directory and splits services into
 * the target (the app being scanned) and its dependencies (postgres, redis, etc.).
 * Returns null if no compose file is found.
 */
export async function parseDockerCompose(repoDir: string): Promise<ParsedCompose | null> {
  const candidates = ['docker-compose.yml', 'docker-compose.yaml'];
  let raw: string | null = null;

  for (const name of candidates) {
    try {
      raw = await fs.readFile(path.join(repoDir, name), 'utf-8');
      break;
    } catch {
      // try next
    }
  }

  if (!raw) return null;

  const compose = yaml.parse(raw) as { services?: Record<string, ComposeService> };
  const entries = Object.entries(compose.services ?? {});
  if (entries.length === 0) return null;

  // The target service is the one with a `build` directive, or the one whose
  // image doesn't match a known dependency prefix
  const targetEntry = entries.find(([, svc]) => {
    if (svc.build) return true;
    if (!svc.image) return true;
    return !DEP_IMAGE_PREFIXES.some((p) => svc.image!.toLowerCase().startsWith(p));
  }) ?? entries[0];

  const [targetServiceName] = targetEntry;

  const dependencies: ParsedDependency[] = entries
    .filter(([name]) => name !== targetServiceName)
    .filter(([, svc]) => !!svc.image)
    .map(([name, svc]) => ({
      name,
      image: svc.image!,
      env: normaliseEnv(svc.environment),
    }));

  return { targetServiceName, dependencies };
}

export function normaliseEnv(env: ComposeService['environment']): Record<string, string> {
  if (!env) return {};
  if (Array.isArray(env)) {
    return Object.fromEntries(
      env.map((e) => {
        const idx = e.indexOf('=');
        return idx > -1 ? [e.slice(0, idx), e.slice(idx + 1)] : [e, ''];
      }),
    );
  }
  return { ...env };
}
