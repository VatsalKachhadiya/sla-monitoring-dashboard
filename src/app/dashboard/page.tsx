"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import ServiceAvailabilityChart from "@/components/ServiceAvailabilityChart";
import { Logo } from "@/components/Logo";
import type {
  OverallStats,
  LogsResponse,
  DBMonitoringCheck,
  SortField,
  SortOrder,
} from "@/types";

type FilterMode = "single" | "range";

interface ActiveFilters {
  mode: FilterMode;
  date: string;
  dateFrom: string;
  dateTo: string;
  timeFrom: string;
  timeTo: string;
  service: string;
}

export default function DashboardPage() {
  // Stats state
  const [stats, setStats] = useState<OverallStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [statsCollapsed, setStatsCollapsed] = useState(false);
  const [showMethodology, setShowMethodology] = useState(false);

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

  // Sorting state
  const [sortBy, setSortBy] = useState<SortField>("timestamp");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // Filter input state
  const [filterMode, setFilterMode] = useState<FilterMode>("single");
  const [singleDate, setSingleDate] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [filterValidationError, setFilterValidationError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Applied filters tracking
  const [appliedFilters, setAppliedFilters] = useState<ActiveFilters>({
    mode: "single",
    date: "",
    dateFrom: "",
    dateTo: "",
    timeFrom: "",
    timeTo: "",
    service: "",
  });

  // Fetch stats (dynamically reflects active filters)
  const fetchStats = useCallback(
    async (filters: ActiveFilters = appliedFilters) => {
      setStatsLoading(true);
      setStatsError(null);
      try {
        const params = new URLSearchParams();
        if (filters.mode === "single" && filters.date) {
          params.set("date", filters.date);
        } else if (filters.mode === "range") {
          if (filters.dateFrom) params.set("date_from", filters.dateFrom);
          if (filters.dateTo) params.set("date_to", filters.dateTo);
        }

        if (filters.timeFrom) params.set("time_from", filters.timeFrom);
        if (filters.timeTo) params.set("time_to", filters.timeTo);
        if (filters.service) params.set("service_id", filters.service);

        const res = await fetch(`/api/stats?${params.toString()}`);
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
    },
    [appliedFilters]
  );

  // Fetch logs with server-side pagination, filters, and sorting
  const fetchLogs = useCallback(
    async (
      page: number = 1,
      filters: ActiveFilters = appliedFilters,
      currentSortBy: SortField = sortBy,
      currentSortOrder: SortOrder = sortOrder
    ) => {
      setLogsLoading(true);
      setLogsError(null);
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("page_size", "50");
        params.set("sort_by", currentSortBy);
        params.set("sort_order", currentSortOrder);

        if (filters.mode === "single" && filters.date) {
          params.set("date", filters.date);
        } else if (filters.mode === "range") {
          if (filters.dateFrom) params.set("date_from", filters.dateFrom);
          if (filters.dateTo) params.set("date_to", filters.dateTo);
        }

        if (filters.timeFrom) params.set("time_from", filters.timeFrom);
        if (filters.timeTo) params.set("time_to", filters.timeTo);
        if (filters.service) params.set("service_id", filters.service);

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
    [appliedFilters, sortBy, sortOrder]
  );

  // Initial load on mount
  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        const statsRes = await fetch("/api/stats");
        if (!statsRes.ok) {
          const errData = await statsRes.json();
          throw new Error(errData.error || "Failed to fetch statistics");
        }
        const statsData: OverallStats = await statsRes.json();
        if (active) {
          setStats(statsData);
          setStatsLoading(false);
        }
      } catch (err) {
        if (active) {
          setStatsError(
            err instanceof Error ? err.message : "Failed to fetch statistics"
          );
          setStatsLoading(false);
        }
      }

      try {
        const logsRes = await fetch(
          "/api/logs?page=1&page_size=50&sort_by=timestamp&sort_order=desc"
        );
        if (!logsRes.ok) {
          const errData = await logsRes.json();
          throw new Error(errData.error || "Failed to fetch logs");
        }
        const logsData: LogsResponse = await logsRes.json();
        if (active) {
          setLogs(logsData.data);
          setLogsMeta({
            total: logsData.total,
            page: logsData.page,
            page_size: logsData.page_size,
            total_pages: logsData.total_pages,
          });
          setLogsLoading(false);
        }
      } catch (err) {
        if (active) {
          setLogsError(
            err instanceof Error ? err.message : "Failed to fetch logs"
          );
          setLogsLoading(false);
        }
      }
    }

    initialize();

    return () => {
      active = false;
    };
  }, []);

  // Handle Apply Filters
  const handleApplyFilters = () => {
    // Validate inputs
    if (timeFrom && timeTo && timeFrom > timeTo) {
      setFilterValidationError(
        `From Time (${timeFrom}) cannot be later than To Time (${timeTo}).`
      );
      return;
    }
    if (filterMode === "range" && dateFrom && dateTo && dateFrom > dateTo) {
      setFilterValidationError(
        `From Date (${dateFrom}) cannot be later than To Date (${dateTo}).`
      );
      return;
    }
    setFilterValidationError(null);

    const nextFilters: ActiveFilters = {
      mode: filterMode,
      date: filterMode === "single" ? singleDate : "",
      dateFrom: filterMode === "range" ? dateFrom : "",
      dateTo: filterMode === "range" ? dateTo : "",
      timeFrom,
      timeTo,
      service: serviceFilter,
    };

    setAppliedFilters(nextFilters);
    setCurrentPage(1);
    fetchLogs(1, nextFilters, sortBy, sortOrder);
    fetchStats(nextFilters);
  };

  // Handle Clear Filters
  const handleClearFilters = () => {
    setSingleDate("");
    setDateFrom("");
    setDateTo("");
    setTimeFrom("");
    setTimeTo("");
    setServiceFilter("");
    setFilterValidationError(null);

    const cleared: ActiveFilters = {
      mode: filterMode,
      date: "",
      dateFrom: "",
      dateTo: "",
      timeFrom: "",
      timeTo: "",
      service: "",
    };

    setAppliedFilters(cleared);
    setCurrentPage(1);
    fetchLogs(1, cleared, sortBy, sortOrder);
    fetchStats(cleared);
  };

  // Handle Sort Column Click
  const handleSortChange = (column: SortField) => {
    let nextOrder: SortOrder = "asc";
    if (sortBy === column) {
      // Toggle direction
      nextOrder = sortOrder === "asc" ? "desc" : "asc";
    } else {
      // Sensible initial direction: newest first for timestamp, highest first for latency
      nextOrder =
        column === "timestamp" || column === "latency" ? "desc" : "asc";
    }

    setSortBy(column);
    setSortOrder(nextOrder);
    setCurrentPage(1);
    fetchLogs(1, appliedFilters, column, nextOrder);
  };

  // Handle Page Navigation
  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    fetchLogs(newPage, appliedFilters, sortBy, sortOrder);
  };

  const formatTimestamp = (ts: string) => {
    const d = new Date(ts);
    return (
      d.toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        timeZone: "UTC",
      }) + " UTC"
    );
  };

  const formatLatency = (ms: number | null) => {
    if (ms === null || ms === undefined) return "—";
    if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
    return `${Math.round(ms)}ms`;
  };

  const hasActiveFilters = Boolean(
    (appliedFilters.mode === "single" && appliedFilters.date) ||
      (appliedFilters.mode === "range" &&
        (appliedFilters.dateFrom || appliedFilters.dateTo)) ||
      appliedFilters.timeFrom ||
      appliedFilters.timeTo ||
      appliedFilters.service
  );

  // Get unique services from stats for filter dropdown
  const services = stats?.services.map((s) => s.service_id) || [];

  return (
    <div className="app-container">
      <header className="app-header">
        <Logo href="/dashboard" />
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
        <div className="dashboard-header-row">
          <div>
            <h1 className="dashboard-title">SLA Dashboard</h1>
            <p className="dashboard-subtitle">
              {stats?.date_range
                ? `Monitoring window: ${stats.date_range.start.substring(0, 10)} to ${stats.date_range.end.substring(0, 10)} (UTC)`
                : "Upload monitoring data to view SLA statistics"}
            </p>
          </div>
          <button
            className={`methodology-toggle-btn ${showMethodology ? "active" : ""}`}
            onClick={() => setShowMethodology(!showMethodology)}
            aria-expanded={showMethodology}
          >
            ℹ SLA Methodology & Definitions
          </button>
        </div>

        {/* ── SLA Methodology Help Box ── */}
        {showMethodology && (
          <div className="methodology-card">
            <div className="methodology-header">
              <h3>📐 SLA Calculation & Operational Definitions</h3>
              <button
                className="methodology-close"
                onClick={() => setShowMethodology(false)}
                aria-label="Close methodology explanation"
              >
                ✕
              </button>
            </div>
            <div className="methodology-grid">
              <div className="methodology-item">
                <div className="methodology-icon">🎯</div>
                <div className="methodology-content">
                  <strong>SLA Target Commitment: 99.900%</strong>
                  <p>
                    The contractual SLA requires <strong>99.900% (three-nines)</strong> availability. A service or the overall platform is classified as <strong>Breached</strong> if availability drops below 99.900%.
                  </p>
                </div>
              </div>
              <div className="methodology-item">
                <div className="methodology-icon">✅</div>
                <div className="methodology-content">
                  <strong>Successful Check Definition</strong>
                  <p>
                    A monitoring probe is defined as <strong>successful</strong> if its HTTP status code is in the <strong>2xx range (200–299)</strong>. Any 4xx client or 5xx server error is counted as downtime. Malformed status codes (e.g. 999) are rejected during ingestion.
                  </p>
                </div>
              </div>
              <div className="methodology-item">
                <div className="methodology-icon">📊</div>
                <div className="methodology-content">
                  <strong>Availability Formula</strong>
                  <p>
                    <code>Availability % = (Successful Checks ÷ Total Checks) × 100</code>, displayed to <strong>3 decimal places</strong> of precision.
                  </p>
                </div>
              </div>
              <div className="methodology-item">
                <div className="methodology-icon">⏱</div>
                <div className="methodology-content">
                  <strong>Latency & Timezone Standards</strong>
                  <p>
                    Tail latencies (Avg, P50, P95, P99) are computed strictly across probes with valid latency measurements. All timestamps, date filters, and worst-day groupings are evaluated in <strong>UTC</strong>.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

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
            <div className="stats-header-title">
              <h2>📈 SLA Statistics</h2>
              <span className="sla-target-chip">SLA Target: 99.900%</span>
              {stats?.is_filtered && stats.filter_description && (
                <span className="filter-chip" style={{ fontSize: "11px" }}>
                  Active Filter: {stats.filter_description}
                </span>
              )}
            </div>
            <span
              className={`collapse-icon ${statsCollapsed ? "collapsed" : ""}`}
            >
              ▼
            </span>
          </div>

          <div
            className={`stats-body ${statsCollapsed ? "collapsed" : "expanded"}`}
          >
            {statsLoading && (
              <div className="loading-state">
                <div className="loading-spinner" />
                <p>Loading SLA statistics...</p>
              </div>
            )}

            {statsError && (
              <div className="error-state">
                <div className="error-icon">⚠</div>
                <p>{statsError}</p>
                <button className="retry-btn" onClick={() => fetchStats(appliedFilters)}>
                  Retry
                </button>
              </div>
            )}

            {stats && !statsLoading && !statsError && stats.total_checks === 0 && (
              <div className="empty-state">
                <div className="empty-icon">🔍</div>
                <h3>No checks found for the active filter window</h3>
                <p>
                  No health check records were found matching {stats.filter_description || "your filters"}.
                  Try clearing or widening your date/time filter.
                </p>
                <button
                  className="filter-btn primary"
                  onClick={handleClearFilters}
                  style={{ marginTop: "12px" }}
                >
                  Clear Filters & Show All
                </button>
              </div>
            )}

            {stats && !statsLoading && !statsError && stats.total_checks > 0 && (
              <>
                {/* Overall metrics row */}
                <div className="overall-metrics">
                  {/* Card 1: Overall Availability */}
                  <div className="metric-card">
                    <div className="metric-label">Overall Availability</div>
                    <div
                      className={`metric-value ${
                        stats.overall_availability_pct >= stats.sla_target
                          ? "success"
                          : "danger"
                      }`}
                    >
                      {stats.overall_availability_pct.toFixed(3)}%
                    </div>
                    <div className="metric-sub">
                      {stats.overall_availability_pct >= stats.sla_target ? (
                        <span className="metric-status-tag success">▲ Above Target</span>
                      ) : (
                        <span className="metric-status-tag danger">▼ Below Target</span>
                      )}{" "}
                      (Target: {stats.sla_target.toFixed(3)}%)
                    </div>
                  </div>

                  {/* Card 2: SLA Status */}
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
                        ? "✓ 0 Breached"
                        : `⚠ ${stats.services.filter((s) => !s.sla_met).length}/${stats.services.length} Services Breached`}
                    </div>
                    <div className="metric-sub">
                      Overall SLA:{" "}
                      <strong
                        style={{
                          color:
                            stats.overall_availability_pct >= stats.sla_target
                              ? "var(--success)"
                              : "var(--danger)",
                        }}
                      >
                        {stats.overall_availability_pct >= stats.sla_target
                          ? "Target Met"
                          : "Below Target"}
                      </strong>
                    </div>
                  </div>

                  {/* Card 3: Total Checks */}
                  <div className="metric-card">
                    <div className="metric-label">Total Checks</div>
                    <div className="metric-value">
                      {stats.total_checks.toLocaleString()}
                    </div>
                    <div className="metric-sub">
                      Across {stats.services.length} services (UTC window)
                    </div>
                  </div>

                  {/* Card 4: Successful Checks */}
                  <div className="metric-card">
                    <div className="metric-label">Successful Checks</div>
                    <div className="metric-value success">
                      {stats.successful_checks.toLocaleString()}
                    </div>
                    <div className="metric-sub">
                      {stats.successful_checks.toLocaleString()} /{" "}
                      {stats.total_checks.toLocaleString()} (
                      {((stats.successful_checks / stats.total_checks) * 100).toFixed(2)}%)
                    </div>
                  </div>

                  {/* Card 5: Failed Checks */}
                  <div className="metric-card">
                    <div className="metric-label">Failed Checks</div>
                    <div className="metric-value danger">
                      {stats.failed_checks.toLocaleString()}
                    </div>
                    <div className="metric-sub">
                      {stats.failed_checks.toLocaleString()} /{" "}
                      {stats.total_checks.toLocaleString()} (
                      {((stats.failed_checks / stats.total_checks) * 100).toFixed(2)}% failure rate)
                    </div>
                  </div>
                </div>

                {/* ── Apache ECharts: Service Availability vs SLA Target ── */}
                <ServiceAvailabilityChart
                  services={stats.services}
                  slaTarget={stats.sla_target}
                  isFiltered={stats.is_filtered}
                  filterDescription={stats.filter_description}
                />

                {/* Per-service cards grid */}
                <div className="services-grid">
                  {stats.services.map((svc) => (
                    <div className="service-card" key={svc.service_id}>
                      <div className="service-card-header">
                        <span className="service-name">
                          {svc.service_name}
                          <span className="service-id-badge">
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
                          <span
                            className="detail-value"
                            style={{
                              color:
                                svc.failed_checks > 0
                                  ? "var(--danger)"
                                  : "var(--text-secondary)",
                            }}
                          >
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
                          <span
                            className="detail-value"
                            title={`Worst Day: ${svc.worst_day || "N/A"}`}
                          >
                            {svc.worst_day || "—"}{" "}
                            {svc.worst_day_availability !== null
                              ? `(${svc.worst_day_availability.toFixed(2)}%)`
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
            <div className="logs-title-row">
              <div className="logs-title-group">
                <h2>📋 Monitoring Logs</h2>
                <span className="count-pill">
                  {hasActiveFilters
                    ? `${logsMeta.total.toLocaleString()} matching records (Filtered)`
                    : `${logsMeta.total.toLocaleString()} total records`}
                </span>
                <span className="count-pill" style={{ opacity: 0.8 }}>
                  Sorted by {sortBy} ({sortOrder.toUpperCase()})
                </span>
              </div>
              {hasActiveFilters && (
                <button
                  className="quick-reset-btn"
                  onClick={handleClearFilters}
                  title="Clear active filters"
                >
                  ✕ Reset Filters
                </button>
              )}
            </div>

            {/* Filter controls row */}
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
                  <label htmlFor="filter-date">Date (UTC)</label>
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
                    <label htmlFor="filter-from">From Date (UTC)</label>
                    <input
                      id="filter-from"
                      type="date"
                      className="filter-input"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                    />
                  </div>
                  <div className="filter-group">
                    <label htmlFor="filter-to">To Date (UTC)</label>
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

              {/* Time filters (optional) */}
              <div className="filter-group">
                <label htmlFor="filter-time-from">From Time (UTC)</label>
                <input
                  id="filter-time-from"
                  type="time"
                  step="60"
                  className="filter-input time-input"
                  value={timeFrom}
                  onChange={(e) => setTimeFrom(e.target.value)}
                  placeholder="HH:mm"
                />
              </div>

              <div className="filter-group">
                <label htmlFor="filter-time-to">To Time (UTC)</label>
                <input
                  id="filter-time-to"
                  type="time"
                  step="60"
                  className="filter-input time-input"
                  value={timeTo}
                  onChange={(e) => setTimeTo(e.target.value)}
                  placeholder="HH:mm"
                />
              </div>

              {/* Service filter */}
              <div className="filter-group">
                <label htmlFor="filter-service">Service</label>
                <select
                  id="filter-service"
                  className="filter-select"
                  value={serviceFilter}
                  onChange={(e) => setServiceFilter(e.target.value)}
                >
                  <option value="">All Services ({services.length})</option>
                  {services.map((svc) => (
                    <option key={svc} value={svc}>
                      {svc}
                    </option>
                  ))}
                </select>
              </div>

              {/* Action buttons */}
              <button
                className="filter-btn primary"
                onClick={handleApplyFilters}
                disabled={logsLoading}
              >
                Apply Filters
              </button>
              <button
                className="filter-btn secondary"
                onClick={handleClearFilters}
                disabled={logsLoading}
              >
                Clear
              </button>
            </div>

            {/* Inline validation error */}
            {filterValidationError && (
              <div className="filter-validation-error">
                <span>⚠️</span>
                <span>{filterValidationError}</span>
              </div>
            )}

            {/* Active filter chips */}
            {hasActiveFilters && (
              <div className="active-filter-chips">
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  Active filters:
                </span>
                {appliedFilters.mode === "single" && appliedFilters.date && (
                  <span className="filter-chip">
                    Date: {appliedFilters.date} (UTC)
                  </span>
                )}
                {appliedFilters.mode === "range" &&
                  (appliedFilters.dateFrom || appliedFilters.dateTo) && (
                    <span className="filter-chip">
                      Range: {appliedFilters.dateFrom || "Start"} →{" "}
                      {appliedFilters.dateTo || "End"} (UTC)
                    </span>
                  )}
                {(appliedFilters.timeFrom || appliedFilters.timeTo) && (
                  <span className="filter-chip">
                    Time: {appliedFilters.timeFrom || "00:00"}–
                    {appliedFilters.timeTo || "23:59"} (UTC)
                  </span>
                )}
                {appliedFilters.service && (
                  <span className="filter-chip">
                    Service: {appliedFilters.service}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Logs table with clickable sortable headers */}
          <div className="logs-table-container">
            {logsLoading && (
              <div className="loading-state">
                <div className="loading-spinner" />
                <p>Loading monitoring logs...</p>
              </div>
            )}

            {logsError && (
              <div className="error-state">
                <div className="error-icon">⚠</div>
                <p>{logsError}</p>
                <button
                  className="retry-btn"
                  onClick={() =>
                    fetchLogs(currentPage, appliedFilters, sortBy, sortOrder)
                  }
                >
                  Retry
                </button>
              </div>
            )}

            {!logsLoading && !logsError && logs.length === 0 && (
              <div className="empty-state">
                <div className="empty-icon">
                  {hasActiveFilters ? "🔍" : "📭"}
                </div>
                <h3>
                  {hasActiveFilters
                    ? "No logs match your filter criteria"
                    : "No monitoring data available"}
                </h3>
                <p>
                  {hasActiveFilters
                    ? "No logs were found for the selected date, time window, or service. Try adjusting or resetting your filters."
                    : "Upload a CSV dataset to view health check logs and SLA analytics."}
                </p>
                {hasActiveFilters ? (
                  <button
                    className="filter-btn primary"
                    onClick={handleClearFilters}
                    style={{ marginTop: "12px" }}
                  >
                    Clear Filters & Show All
                  </button>
                ) : (
                  <Link
                    href="/"
                    className="view-dashboard-btn"
                    style={{ marginTop: "12px" }}
                  >
                    Upload CSV Dataset →
                  </Link>
                )}
              </div>
            )}

            {!logsLoading && !logsError && logs.length > 0 && (
              <table className="logs-table">
                <thead>
                  <tr>
                    {/* Timestamp Header */}
                    <th
                      className="sortable-th"
                      onClick={() => handleSortChange("timestamp")}
                      title="Click to sort by Timestamp"
                    >
                      <div className="th-content">
                        <span>Timestamp (UTC)</span>
                        <span
                          className={`sort-badge ${
                            sortBy === "timestamp" ? "active" : "idle"
                          }`}
                        >
                          {sortBy === "timestamp"
                            ? sortOrder === "asc"
                              ? "↑ ASC"
                              : "↓ DESC"
                            : "↕"}
                        </span>
                      </div>
                    </th>

                    {/* Service Header */}
                    <th
                      className="sortable-th"
                      onClick={() => handleSortChange("service")}
                      title="Click to sort by Service Name"
                    >
                      <div className="th-content">
                        <span>Service</span>
                        <span
                          className={`sort-badge ${
                            sortBy === "service" ? "active" : "idle"
                          }`}
                        >
                          {sortBy === "service"
                            ? sortOrder === "asc"
                              ? "↑ ASC"
                              : "↓ DESC"
                            : "↕"}
                        </span>
                      </div>
                    </th>

                    {/* Status Code Header */}
                    <th
                      className="sortable-th"
                      onClick={() => handleSortChange("status")}
                      title="Click to sort by HTTP Status Code"
                    >
                      <div className="th-content">
                        <span>Status</span>
                        <span
                          className={`sort-badge ${
                            sortBy === "status" ? "active" : "idle"
                          }`}
                        >
                          {sortBy === "status"
                            ? sortOrder === "asc"
                              ? "↑ ASC"
                              : "↓ DESC"
                            : "↕"}
                        </span>
                      </div>
                    </th>

                    {/* Latency Header */}
                    <th
                      className="sortable-th"
                      onClick={() => handleSortChange("latency")}
                      title="Click to sort by Latency"
                    >
                      <div className="th-content">
                        <span>Latency</span>
                        <span
                          className={`sort-badge ${
                            sortBy === "latency" ? "active" : "idle"
                          }`}
                        >
                          {sortBy === "latency"
                            ? sortOrder === "asc"
                              ? "↑ ASC"
                              : "↓ DESC"
                            : "↕"}
                        </span>
                      </div>
                    </th>

                    {/* Agent Header */}
                    <th
                      className="sortable-th"
                      onClick={() => handleSortChange("agent")}
                      title="Click to sort by Monitoring Agent"
                    >
                      <div className="th-content">
                        <span>Agent</span>
                        <span
                          className={`sort-badge ${
                            sortBy === "agent" ? "active" : "idle"
                          }`}
                        >
                          {sortBy === "agent"
                            ? sortOrder === "asc"
                              ? "↑ ASC"
                              : "↓ DESC"
                            : "↕"}
                        </span>
                      </div>
                    </th>

                    {/* Region Header */}
                    <th
                      className="sortable-th"
                      onClick={() => handleSortChange("region")}
                      title="Click to sort by Region"
                    >
                      <div className="th-content">
                        <span>Region</span>
                        <span
                          className={`sort-badge ${
                            sortBy === "region" ? "active" : "idle"
                          }`}
                        >
                          {sortBy === "region"
                            ? sortOrder === "asc"
                              ? "↑ ASC"
                              : "↓ DESC"
                            : "↕"}
                        </span>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td className="log-timestamp">
                        {formatTimestamp(log.timestamp)}
                      </td>
                      <td>
                        <div className="log-service-cell">
                          <span className="log-service-name">
                            {log.service_name}
                          </span>
                          <span className="log-service-id">
                            {log.service_id}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span
                          className={`status-badge ${
                            log.is_healthy
                              ? "healthy"
                              : log.status_code >= 500
                              ? "unhealthy"
                              : "warning"
                          }`}
                        >
                          {log.status_code}
                        </span>
                      </td>
                      <td>{formatLatency(log.latency_ms)}</td>
                      <td>
                        <span className="agent-tag">{log.agent}</span>
                      </td>
                      <td>
                        <span className="region-tag">{log.region}</span>
                      </td>
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
                {logsMeta.total.toLocaleString()} records (UTC)
              </span>
              <div className="pagination-controls">
                <button
                  className="page-btn"
                  disabled={currentPage <= 1 || logsLoading}
                  onClick={() => handlePageChange(1)}
                  title="First Page"
                >
                  « First
                </button>
                <button
                  className="page-btn"
                  disabled={currentPage <= 1 || logsLoading}
                  onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                  title="Previous Page"
                >
                  ‹ Prev
                </button>
                <span className="page-info">
                  Page {logsMeta.page} of {logsMeta.total_pages}
                </span>
                <button
                  className="page-btn"
                  disabled={currentPage >= logsMeta.total_pages || logsLoading}
                  onClick={() => handlePageChange(currentPage + 1)}
                  title="Next Page"
                >
                  Next ›
                </button>
                <button
                  className="page-btn"
                  disabled={currentPage >= logsMeta.total_pages || logsLoading}
                  onClick={() => handlePageChange(logsMeta.total_pages)}
                  title="Last Page"
                >
                  Last »
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
