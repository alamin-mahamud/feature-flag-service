import { Injectable } from '@nestjs/common';
import { metrics, Histogram, Counter } from '@opentelemetry/api';

/**
 * Central metrics façade. All instrumentation points go through here.
 *
 * Metric names (after GCP prefix) become:
 *   custom.googleapis.com/feature_flag_service/evaluation/latency_ms
 *   custom.googleapis.com/feature_flag_service/evaluation/count
 *   custom.googleapis.com/feature_flag_service/cache/hits
 *   custom.googleapis.com/feature_flag_service/cache/misses
 *   custom.googleapis.com/feature_flag_service/errors/count
 */
@Injectable()
export class MetricsService {
  private readonly meter = metrics.getMeter('feature-flag-service', '1.0.0');

  /** Histogram — p50/p95/p99 evaluation latency in milliseconds */
  private readonly evalLatency: Histogram = this.meter.createHistogram(
    'evaluation.latency_ms',
    {
      description: 'Flag evaluation end-to-end latency in milliseconds',
      unit: 'ms',
    },
  );

  /** Counter — evaluations by tenant */
  private readonly evalCount: Counter = this.meter.createCounter(
    'evaluation.count',
    { description: 'Total flag evaluations' },
  );

  /** Counter — Redis cache hits */
  private readonly cacheHits: Counter = this.meter.createCounter('cache.hits', {
    description: 'Redis cache hits',
  });

  /** Counter — Redis cache misses */
  private readonly cacheMisses: Counter = this.meter.createCounter(
    'cache.misses',
    { description: 'Redis cache misses' },
  );

  /** Counter — HTTP errors by tenant + endpoint */
  private readonly errorCount: Counter = this.meter.createCounter(
    'errors.count',
    { description: 'HTTP errors by tenant, endpoint, and status code' },
  );

  recordEvaluation(opts: {
    tenantId: string;
    latencyMs: number;
    type: 'single' | 'bulk';
  }): void {
    const attrs = { tenant_id: opts.tenantId, type: opts.type };
    this.evalLatency.record(opts.latencyMs, attrs);
    this.evalCount.add(1, attrs);
  }

  recordCacheHit(tenantId: string): void {
    this.cacheHits.add(1, { tenant_id: tenantId });
  }

  recordCacheMiss(tenantId: string): void {
    this.cacheMisses.add(1, { tenant_id: tenantId });
  }

  recordError(opts: {
    tenantId: string;
    endpoint: string;
    statusCode: number;
  }): void {
    this.errorCount.add(1, {
      tenant_id: opts.tenantId,
      endpoint: opts.endpoint,
      status_code: String(opts.statusCode),
    });
  }
}
