import { Queue } from 'bullmq';
import { bullMQConnection } from './redis';

export interface ScanJobData {
  scanId: string;
  serviceId: string;
  userId: string;
  attackProfile: string;
}

export const scanQueue = new Queue<ScanJobData>('scans', {
  connection: bullMQConnection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});
