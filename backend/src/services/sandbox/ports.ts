import net from 'net';

/**
 * Asks the OS for a free TCP port by binding to :0 and immediately releasing it.
 * Used to pick a host port to expose the sandboxed service on.
 */
export function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : null;
      server.close(() => {
        if (port) resolve(port);
        else reject(new Error('Could not allocate a free port'));
      });
    });
    server.on('error', reject);
  });
}
