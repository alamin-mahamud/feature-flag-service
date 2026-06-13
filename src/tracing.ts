/**
 * OpenTelemetry SDK initialisation — must be imported BEFORE any other module
 * so instrumentation patches are in place before NestJS bootstraps.
 *
 * Metrics are exported to GCP Cloud Monitoring every 60 s.
 * On non-GCP environments (local, CI) the exporter is omitted — the app
 * starts cleanly and metrics are simply not collected.
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { MetricExporter as CloudMonitoringExporter } from '@google-cloud/opentelemetry-cloud-monitoring-exporter';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';

const isGcp = !!(process.env.K_SERVICE || process.env.GOOGLE_CLOUD_PROJECT);

const sdk = new NodeSDK({
  serviceName: 'feature-flag-service',
  ...(isGcp && {
    metricReader: new PeriodicExportingMetricReader({
      exporter: new CloudMonitoringExporter({
        prefix: 'custom.googleapis.com/feature_flag_service',
      }),
      exportIntervalMillis: 60_000,
    }),
  }),
  instrumentations: [new HttpInstrumentation()],
});

sdk.start();

process.on('SIGTERM', () => {
  sdk.shutdown().catch(() => undefined);
});
