"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { OverallStats, LogsResponse, DBMonitoringCheck } from "@/types";

type FilterMode = "single" | "range";

export default function DashboardPage() {
  // Stats state
  const [stats, setStats] = useState<OverallStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [statsCollapsed, setStatsCollapsed] = useState(false);

  // Logs state
  const [logs, setLogs] = useState<DBMonitoringCheck[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [logsMeta, setLogsMeta] = useState({
    total: 0,
    page: 1,
    page_size: 50,
    total_pages: 0,
  });

  // Filter state
  const [filterMode, setFilterMode] = useState<FilterMode>("single");
  const [singleDate, setSingleDate] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const res = await fetch("/api/stats");
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to fetch statistics");
      }
      const data: OverallStats = await res.json();
      setStats(data);
    } catch (err) {
      setStatsError(
        err instanceof Error ? err.message : "Failed to fetch statistics"
      );
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // Fetch logs
  const fetchLogs = useCallback(
    async (page: number = 1) => {
      setLogsLoading(true);
      setLogsError(null);
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("page_size", "50");

        if (filterMode === "single" && singleDate) {
          params.set("date", singleDate);
        } else if (filterMode === "range") {
          if (dateFrom) params.set("date_from", dateFrom);
          if (dateTo) params.set("date_to", dateTo);
        }

        if (serviceFilter) {
          params.set("service_id", serviceFilter);
        }

        const res = await fetch(`/api/logs?${params.toString()}`);
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || "Failed to fetch logs");
        }
        const data: LogsResponse = await res.json();
        setLogs(data.data);
        setLogsMeta({
          total: data.total,
          page: data.page,
          page_size: data.page_size,
          total_pages: data.total_pages,
        });
      } catch (err) {
        setLogsError(
          err instanceof Error ? err.message : "Failed to fetch logs"
        );
      } finally {
        setLogsLoading(false);
      }
    },
    [filterMode, singleDate, dateFrom, dateTo, serviceFilter]
  );

  // Initial load
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchLogs(currentPage);
  }, [fetchLogs, currentPage]);

  const handleApplyFilters = () => {
    setCurrentPage(1);
    fetchLogs(1);
  };

  const handleClearFilters = () => {
    setSingleDate("");
    setDateFrom("");
    setDateTo("");
    setServiceFilter("");
    setCurrentPage(1);
  };

  const formatTimestamp = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: "UTC",
    }) + " UTC";
  };

  const formatLatency = (ms: number | null) => {
    if (ms === null || ms === undefined) return "—";
    if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
    return `${Math.round(ms)}ms`;
  };

  // Get unique services from stats for filter dropdown
  const services = stats?.services.map((s) => s.service_id) || [];

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>📊 SLA Monitor</h1>
        <nav>
          <Link href="/" className="nav-link">
            Upload
          </Link>
          <Link href="/dashboard" className="nav-link active">
            Dashboard
          </Link>
        </nav>
      </header>

      <main className="main-content dashboard-page">
        <h1 className="dashboard-title">SLA Dashboard</h1>
        <p className="dashboard-subtitle">
          {stats?.date_range
            ? `Monitoring data from ${stats.date_range.start.substring(0, 10)} to ${stats.date_range.end.substring(0, 10)}`
            : "Upload monitoring data to view SLA statistics"}
        </p>

        {/* ── Stats Section ── */}
        <section className="stats-section" id="stats-section">
          <div
            className="stats-header"
            onClick={() => setStatsCollapsed(!statsCollapsed)}
            role="button"
            aria-expanded={!statsCollapsed}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setStatsCollapsed(!statsCollapsed);
              }
            }}
          >
            <h2>
              📈 SLA Statistics
              <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 400 }}>
                (SLA Target: 99.9%)
              </span>
            </h2>
            <span className={`collapse-icon ${statsCollapsed ? "collapsed" : ""}`}>
              ▼
            </span>
          </div>

          <div className={`stats-body ${statsCollapsed ? "collapsed" : "expanded"}`}>
            {statsLoading && (
              <div className="loading-state">
                <div className="loading-spinner" />
                <p>Loading statistics...</p>
              </div>
            )}

            {statsError && (
              <div className="error-state">
                <div className="error-icon">⚠</div>
                <p>{statsError}</p>
                <button className="retry-btn" onClick={fetchStats}>
                  Retry
                </button>
              </div>
            )}

            {stats && !statsLoading && !statsError && (
              <>
                {/* Overall metrics */}
                <div className="overall-metrics">
                  <div className="metric-card">
                    <div className="metric-label">Overall Availability</div>
                    <div
                      className={`metric-value ${
                        stats.overall_availability_pct >= 99.9
                          ? "success"
                          : "danger"
                      }`}
                    >
                      {stats.overall_availability_pct.toFixed(3)}%
                    </div>
                    <div className="metric-sub">
                      Target: {stats.sla_target}%
                    </div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-label">Total Checks</div>
                    <div className="metric-value">
                      {stats.total_checks.toLocaleString()}
                    </div>
                    <div className="metric-sub">
                      Across {stats.services.length} services
                    </div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-label">Successful</div>
                    <div className="metric-value success">
                      {stats.successful_checks.toLocaleString()}
                    </div>
                    <div className="metric-sub">
                      {((stats.successful_checks / stats.total_checks) * 100).toFixed(1)}%
                      of total
                    </div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-label">Failed</div>
                    <div className="metric-value danger">
                      {stats.failed_checks.toLocaleString()}
                    </div>
                    <div className="metric-sub">
                      {((stats.failed_checks / stats.total_checks) * 100).toFixed(2)}%
                      failure rate
                    </div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-label">SLA Status</div>
                    <div
                      className={`metric-value ${
                        stats.services.every((s) => s.sla_met)
                          ? "success"
                          : "danger"
                      }`}
                    >
                      {stats.services.every((s) => s.sla_met)
                        ? "✓ All Met"
                        : `⚠ ${stats.services.filter((s) => !s.sla_met).length} Breached`}
                    </div>
                    <div className="metric-sub">
                      Out of {stats.services.length} services
                    </div>
                  </div>
                </div>

                {/* Per-service cards */}
                <div className="services-grid">
                  {stats.services.map((svc) => (
                    <div className="service-card" key={svc.service_id}>
                      <div className="service-card-header">
                        <span className="service-name">
                          {svc.service_name}
                          <span
                            style={{
                              color: "var(--text-muted)",
                              fontSize: "11px",
                              marginLeft: "6px",
                            }}
                          >
                            {svc.service_id}
                          </span>
                        </span>
                        <span
                          className={`sla-badge ${svc.sla_met ? "met" : "breached"}`}
                        >
                          {svc.sla_met ? "SLA Met" : "Breached"}
                        </span>
                      </div>
                      <div
                        className="service-availability"
                        style={{
                          color: svc.sla_met
                            ? "var(--success)"
                            : "var(--danger)",
                        }}
                      >
                        {svc.availability_pct.toFixed(3)}%
                      </div>
                      <div className="service-details">
                        <div className="service-detail">
                          <span className="detail-label">Total Checks</span>
                          <span className="detail-value">
                            {svc.total_checks.toLocaleString()}
                          </span>
                        </div>
                        <div className="service-detail">
                          <span className="detail-label">Failed</span>
                          <span className="detail-value">
                            {svc.failed_checks}
                          </span>
                        </div>
                        <div className="service-detail">
                          <span className="detail-label">Avg Latency</span>
                          <span className="detail-value">
                            {formatLatency(svc.avg_latency_ms)}
                          </span>
                        </div>
                        <div className="service-detail">
                          <span className="detail-label">P95 Latency</span>
                          <span className="detail-value">
                            {formatLatency(svc.p95_latency_ms)}
                          </span>
                        </div>
                        <div className="service-detail">
                          <span className="detail-label">P99 Latency</span>
                          <span className="detail-value">
                            {formatLatency(svc.p99_latency_ms)}
                          </span>
                        </div>
                        <div className="service-detail">
                          <span className="detail-label">Worst Day</span>
                          <span className="detail-value">
                            {svc.worst_day || "—"}{" "}
                            {svc.worst_day_availability !== null
                              ? `(${svc.worst_day_availability.toFixed(1)}%)`
                              : ""}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>

        {/* ── Logs Section ── */}
        <section className="logs-section" id="logs-section">
          <div className="logs-header">
            <h2>📋 Monitoring Logs</h2>

            <div className="filters-row">
              {/* Filter mode toggle */}
              <div className="filter-group">
                <label>Filter Mode</label>
                <div className="filter-mode-toggle">
                  <button
                    className={`filter-mode-btn ${filterMode === "single" ? "active" : ""}`}
                    onClick={() => setFilterMode("single")}
                  >
                    Single Date
                  </button>
                  <button
                    className={`filter-mode-btn ${filterMode === "range" ? "active" : ""}`}
                    onClick={() => setFilterMode("range")}
                  >
                    Date Range
                  </button>
                </div>
              </div>

              {/* Date filters */}
              {filterMode === "single" ? (
                <div className="filter-group">
                  <label htmlFor="filter-date">Date</label>
                  <input
                    id="filter-date"
                    type="date"
                    className="filter-input"
                    value={singleDate}
                    onChange={(e) => setSingleDate(e.target.value)}
                  />
                </div>
              ) : (
                <>
                  <div className="filter-group">
                    <label htmlFor="filter-from">From</label>
                    <input
                      id="filter-from"
                      type="date"
                      className="filter-input"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                    />
                  </div>
                  <div className="filter-group">
                    <label htmlFor="filter-to">To</label>
                    <input
                      id="filter-to"
                      type="date"
                      className="filter-input"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                    />
                  </div>
                </>
              )}

              {/* Service filter */}
              <div className="filter-group">
                <label htmlFor="filter-service">Service</label>
                <select
                  id="filter-service"
                  className="filter-select"
                  value={serviceFilter}
                  onChange={(e) => setServiceFilter(e.target.value)}
                >
                  <option value="">All Services</option>
                  {services.map((svc) => (
                    <option key={svc} value={svc}>
                      {svc}
                    </option>
                  ))}
                </select>
              </div>

              {/* Action buttons */}
              <button className="filter-btn primary" onClick={handleApplyFilters}>
                Apply
              </button>
              <button className="filter-btn secondary" onClick={handleClearFilters}>
                Clear
              </button>
            </div>
          </div>

          {/* Logs table */}
          <div className="logs-table-container">
            {logsLoading && (
              <div className="loading-state">
                <div className="loading-spinner" />
                <p>Loading logs...</p>
              </div>
            )}

            {logsError && (
              <div className="error-state">
                <div className="error-icon">⚠</div>
                <p>{logsError}</p>
                <button className="retry-btn" onClick={() => fetchLogs(currentPage)}>
                  Retry
                </button>
              </div>
            )}

            {!logsLoading && !logsError && logs.length === 0 && (
              <div className="empty-state">
                <div className="empty-icon">📭</div>
                <p>
                  No logs found.{" "}
                  {singleDate || dateFrom || dateTo || serviceFilter
                    ? "Try adjusting your filters."
                    : "Upload monitoring data first."}
                </p>
              </div>
            )}

            {!logsLoading && !logsError && logs.length > 0 && (
              <table className="logs-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Service</th>
                    <th>Status</th>
                    <th>Latency</th>
                    <th>Agent</th>
                    <th>Region</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td>{formatTimestamp(log.timestamp)}</td>
                      <td>
                        <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>
                          {log.service_name}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`status-badge ${log.is_healthy ? "healthy" : "unhealthy"}`}
                        >
                          {log.status_code}
                        </span>
                      </td>
                      <td>{formatLatency(log.latency_ms)}</td>
                      <td>{log.agent}</td>
                      <td>{log.region}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination footer */}
          {!logsLoading && logs.length > 0 && (
            <div className="logs-footer">
              <span>
                Showing {(logsMeta.page - 1) * logsMeta.page_size + 1}–
                {Math.min(logsMeta.page * logsMeta.page_size, logsMeta.total)} of{" "}
                {logsMeta.total.toLocaleString()} records
              </span>
              <div className="pagination-controls">
                <button
                  className="page-btn"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  ← Prev
                </button>
                <span className="page-info">
                  Page {logsMeta.page} of {logsMeta.total_pages}
                </span>
                <button
                  className="page-btn"
                  disabled={currentPage >= logsMeta.total_pages}
                  onClick={() => setCurrentPage((p) => p + 1)}
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
