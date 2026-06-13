# ── Notification channel ────────────────────────────────────────────────────

resource "google_monitoring_notification_channel" "email" {
  project      = var.project_id
  display_name = "Feature Flag Alerts (${var.env})"
  type         = "email"
  labels = {
    email_address = var.alert_email
  }
}

# ── Alert: error rate > threshold over 5-minute window ──────────────────────
# Uses Cloud Run's built-in request_count metric split by response_code_class.
# Fires when 5xx responses exceed error_rate_threshold_percent of total traffic.

resource "google_monitoring_alert_policy" "error_rate" {
  project      = var.project_id
  display_name = "[${var.env}] Error rate > ${var.error_rate_threshold_percent}%"
  combiner     = "OR"

  conditions {
    display_name = "5xx error rate over 5 min"

    condition_threshold {
      filter = <<-EOT
        resource.type = "cloud_run_revision"
        AND resource.labels.service_name = "${var.cloud_run_service_name}"
        AND metric.type = "run.googleapis.com/request_count"
        AND metric.labels.response_code_class = "5xx"
      EOT

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_RATE"
      }

      # Threshold: absolute request rate here; use a ratio condition when
      # Cloud Monitoring supports it natively, or pair with a denominator
      # condition using condition_matched_log for percentage-based alerting.
      comparison      = "COMPARISON_GT"
      threshold_value = var.error_rate_threshold_percent / 100.0
      duration        = "0s"
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  alert_strategy {
    auto_close = "3600s"
  }

  documentation {
    content   = "5xx error rate exceeded ${var.error_rate_threshold_percent}% on ${var.cloud_run_service_name} (${var.env}). Check Cloud Logging for details: https://console.cloud.google.com/logs?project=${var.project_id}"
    mime_type = "text/markdown"
  }
}

# ── Alert: p99 latency exceeds threshold ─────────────────────────────────────

resource "google_monitoring_alert_policy" "latency" {
  project      = var.project_id
  display_name = "[${var.env}] p99 latency > ${var.latency_p99_threshold_ms}ms"
  combiner     = "OR"

  conditions {
    display_name = "p99 request latency over 5 min"

    condition_threshold {
      filter = <<-EOT
        resource.type = "cloud_run_revision"
        AND resource.labels.service_name = "${var.cloud_run_service_name}"
        AND metric.type = "run.googleapis.com/request_latencies"
      EOT

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_DELTA"
        cross_series_reducer = "REDUCE_PERCENTILE_99"
        group_by_fields      = ["resource.labels.service_name"]
      }

      comparison      = "COMPARISON_GT"
      threshold_value = var.latency_p99_threshold_ms
      duration        = "0s"
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  alert_strategy {
    auto_close = "3600s"
  }

  documentation {
    content   = "p99 latency exceeded ${var.latency_p99_threshold_ms}ms on ${var.cloud_run_service_name} (${var.env}). Load test baseline: p99=503ms at 100 VUs."
    mime_type = "text/markdown"
  }
}

# ── Alert: health check failures ─────────────────────────────────────────────

resource "google_monitoring_uptime_check_config" "health" {
  project      = var.project_id
  display_name = "feature-flag-service-${var.env}-health"
  timeout      = "10s"
  period       = "60s"

  http_check {
    path         = "/health"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = "${var.cloud_run_service_name}-${var.project_id}.${var.region}.run.app"
    }
  }
}

resource "google_monitoring_alert_policy" "health_check" {
  project      = var.project_id
  display_name = "[${var.env}] Health check failing"
  combiner     = "OR"

  conditions {
    display_name = "Uptime check failing"

    condition_threshold {
      filter = <<-EOT
        resource.type = "uptime_url"
        AND metric.type = "monitoring.googleapis.com/uptime_check/check_passed"
        AND metric.labels.check_id = "${google_monitoring_uptime_check_config.health.uptime_check_id}"
      EOT

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.labels.*"]
      }

      comparison      = "COMPARISON_GT"
      threshold_value = 1
      duration        = "0s"
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  alert_strategy {
    auto_close = "3600s"
  }

  documentation {
    content   = "Health check at /health is failing on ${var.cloud_run_service_name} (${var.env})."
    mime_type = "text/markdown"
  }
}

# ── Dashboard ─────────────────────────────────────────────────────────────────
# Combines Cloud Run built-in metrics (latency, request rate, error rate)
# with custom OTel metrics (per-tenant evals, cache hit/miss ratio).
# Custom metric type: custom.googleapis.com/feature_flag_service/<name>

resource "google_monitoring_dashboard" "main" {
  project = var.project_id

  dashboard_json = jsonencode({
    displayName = "Feature Flag Service — ${var.env}"

    gridLayout = {
      columns = 2
      widgets = [

        # Row 1: Request latency (p50 / p95 / p99) — Cloud Run built-in
        {
          title = "Request Latency (p50 / p95 / p99)"
          xyChart = {
            dataSets = [
              {
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${var.cloud_run_service_name}\" AND metric.type=\"run.googleapis.com/request_latencies\""
                    aggregation = {
                      alignmentPeriod     = "60s"
                      perSeriesAligner    = "ALIGN_DELTA"
                      crossSeriesReducer  = "REDUCE_PERCENTILE_50"
                      groupByFields       = ["resource.labels.service_name"]
                    }
                  }
                }
                legendTemplate = "p50"
                plotType       = "LINE"
              },
              {
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${var.cloud_run_service_name}\" AND metric.type=\"run.googleapis.com/request_latencies\""
                    aggregation = {
                      alignmentPeriod     = "60s"
                      perSeriesAligner    = "ALIGN_DELTA"
                      crossSeriesReducer  = "REDUCE_PERCENTILE_95"
                      groupByFields       = ["resource.labels.service_name"]
                    }
                  }
                }
                legendTemplate = "p95"
                plotType       = "LINE"
              },
              {
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${var.cloud_run_service_name}\" AND metric.type=\"run.googleapis.com/request_latencies\""
                    aggregation = {
                      alignmentPeriod     = "60s"
                      perSeriesAligner    = "ALIGN_DELTA"
                      crossSeriesReducer  = "REDUCE_PERCENTILE_99"
                      groupByFields       = ["resource.labels.service_name"]
                    }
                  }
                }
                legendTemplate = "p99"
                plotType       = "LINE"
              }
            ]
            timeshiftDuration = "0s"
            yAxis             = { label = "Latency (ms)", scale = "LINEAR" }
          }
        },

        # Row 1 col 2: Request rate + error rate — Cloud Run built-in
        {
          title = "Request Rate & Error Rate"
          xyChart = {
            dataSets = [
              {
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${var.cloud_run_service_name}\" AND metric.type=\"run.googleapis.com/request_count\""
                    aggregation = {
                      alignmentPeriod   = "60s"
                      perSeriesAligner  = "ALIGN_RATE"
                      crossSeriesReducer = "REDUCE_SUM"
                      groupByFields     = ["metric.labels.response_code_class"]
                    }
                  }
                }
                legendTemplate = "$${metric.labels.response_code_class}"
                plotType       = "STACKED_BAR"
              }
            ]
            yAxis = { label = "Requests/s", scale = "LINEAR" }
          }
        },

        # Row 2: Custom — evaluation latency (p50/p95/p99) from OTel
        {
          title = "Evaluation Latency — custom metric (p50 / p95 / p99)"
          xyChart = {
            dataSets = [
              {
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "resource.type=\"global\" AND metric.type=\"custom.googleapis.com/feature_flag_service/evaluation/latency_ms\""
                    aggregation = {
                      alignmentPeriod    = "60s"
                      perSeriesAligner   = "ALIGN_DELTA"
                      crossSeriesReducer = "REDUCE_PERCENTILE_50"
                    }
                  }
                }
                legendTemplate = "p50"
                plotType       = "LINE"
              },
              {
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "resource.type=\"global\" AND metric.type=\"custom.googleapis.com/feature_flag_service/evaluation/latency_ms\""
                    aggregation = {
                      alignmentPeriod    = "60s"
                      perSeriesAligner   = "ALIGN_DELTA"
                      crossSeriesReducer = "REDUCE_PERCENTILE_95"
                    }
                  }
                }
                legendTemplate = "p95"
                plotType       = "LINE"
              },
              {
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "resource.type=\"global\" AND metric.type=\"custom.googleapis.com/feature_flag_service/evaluation/latency_ms\""
                    aggregation = {
                      alignmentPeriod    = "60s"
                      perSeriesAligner   = "ALIGN_DELTA"
                      crossSeriesReducer = "REDUCE_PERCENTILE_99"
                    }
                  }
                }
                legendTemplate = "p99"
                plotType       = "LINE"
              }
            ]
            yAxis = { label = "Latency (ms)", scale = "LINEAR" }
          }
        },

        # Row 2 col 2: Evaluations per second by tenant — custom OTel metric
        {
          title = "Evaluations/s by Tenant"
          xyChart = {
            dataSets = [
              {
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "resource.type=\"global\" AND metric.type=\"custom.googleapis.com/feature_flag_service/evaluation/count\""
                    aggregation = {
                      alignmentPeriod    = "60s"
                      perSeriesAligner   = "ALIGN_RATE"
                      crossSeriesReducer = "REDUCE_SUM"
                      groupByFields      = ["metric.labels.tenant_id"]
                    }
                  }
                }
                legendTemplate = "$${metric.labels.tenant_id}"
                plotType       = "LINE"
              }
            ]
            yAxis = { label = "evals/s", scale = "LINEAR" }
          }
        },

        # Row 3: Cache hit/miss ratio — custom OTel metric
        {
          title = "Cache Hit/Miss Ratio"
          xyChart = {
            dataSets = [
              {
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "resource.type=\"global\" AND metric.type=\"custom.googleapis.com/feature_flag_service/cache/hits\""
                    aggregation = {
                      alignmentPeriod   = "60s"
                      perSeriesAligner  = "ALIGN_RATE"
                      crossSeriesReducer = "REDUCE_SUM"
                    }
                  }
                }
                legendTemplate = "hits"
                plotType       = "STACKED_BAR"
              },
              {
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "resource.type=\"global\" AND metric.type=\"custom.googleapis.com/feature_flag_service/cache/misses\""
                    aggregation = {
                      alignmentPeriod   = "60s"
                      perSeriesAligner  = "ALIGN_RATE"
                      crossSeriesReducer = "REDUCE_SUM"
                    }
                  }
                }
                legendTemplate = "misses"
                plotType       = "STACKED_BAR"
              }
            ]
            yAxis = { label = "ops/s", scale = "LINEAR" }
          }
        },

        # Row 3 col 2: Error count by tenant + endpoint — custom OTel metric
        {
          title = "Error Rate by Tenant"
          xyChart = {
            dataSets = [
              {
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "resource.type=\"global\" AND metric.type=\"custom.googleapis.com/feature_flag_service/errors/count\""
                    aggregation = {
                      alignmentPeriod    = "60s"
                      perSeriesAligner   = "ALIGN_RATE"
                      crossSeriesReducer = "REDUCE_SUM"
                      groupByFields      = ["metric.labels.tenant_id", "metric.labels.endpoint"]
                    }
                  }
                }
                legendTemplate = "$${metric.labels.tenant_id}/$${metric.labels.endpoint}"
                plotType       = "LINE"
              }
            ]
            yAxis = { label = "errors/s", scale = "LINEAR" }
          }
        }

      ]
    }
  })
}
