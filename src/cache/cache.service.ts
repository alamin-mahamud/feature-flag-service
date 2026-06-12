import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private client: Redis | null = null;
  private connected = false;

  async onModuleInit() {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    try {
      this.client = new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });
      await this.client.connect();
      this.connected = true;
      this.logger.log('Redis connected');
    } catch {
      this.logger.warn('Redis unavailable — caching disabled');
      this.connected = false;
    }
  }

  async onModuleDestroy() {
    if (this.client) await this.client.quit();
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.connected || !this.client) return null;
    try {
      const val = await this.client.get(key);
      return val ? (JSON.parse(val) as T) : null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds = 60): Promise<void> {
    if (!this.connected || !this.client) return;
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      // cache write failure is non-fatal
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (!this.connected || !this.client || keys.length === 0) return;
    try {
      await this.client.del(...keys);
    } catch {
      // non-fatal
    }
  }

  async delByPattern(pattern: string): Promise<void> {
    if (!this.connected || !this.client) return;
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) await this.client.del(...keys);
    } catch {
      // non-fatal
    }
  }
}
