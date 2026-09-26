// Raw CSV row as parsed from the file
export interface RawCSVRow {
  service_id: string;
  service_name: string;
  timestamp: string;
  status_code: string;
  latency: string;
  latency_unit: string;
  agent: string;
  region: string;
}

// Cleaned and normalized monitoring check record
export interface MonitoringCheck {
  service_id: string;
  service_name: string;
  timestamp: string; // ISO 8601
  status_code: number;
  latency_ms: number | null; // normalized to milliseconds
  agent: string;
  region: string;
  is_healthy: boolean; // true if status_code is 2xx
}

// Record as stored in the database
export interface DBMonitoringCheck extends MonitoringCheck {
  id: number;
  upload_id: string;
  created_at: string;
}

// Data quality issue found during processing
export interface DataQualityIssue {
  type: string;
  description: string;
  count: number;
  action: string;
}

// Upload processing result returned to the frontend
export interface ProcessingResult {
  success: boolean;
  upload_id: string;
  total_rows_parsed: number;
  valid_records_inserted: number;
  duplicates_removed: number;
  invalid_records_skipped: number;
  data_quality_issues: DataQualityIssue[];
  date_range: {
    start: string;
    end: string;
  } | null;
  services_found: string[];
  error?: string;
}

// SLA statistics for the dashboard
export interface ServiceStats {
  service_id: string;
  service_name: string;
  total_checks: number;
  successful_checks: number;
  failed_checks: number;
  availability_pct: number;
  sla_met: boolean; // true if availability >= 99.9%
  avg_latency_ms: number | null;
  p50_latency_ms: number | null;
  p95_latency_ms: number | null;
  p99_latency_ms: number | null;
  worst_day: string | null;
  worst_day_availability: number | null;
}

export interface OverallStats {
  total_checks: number;
  successful_checks: number;
  failed_checks: number;
  overall_availability_pct: number;
  sla_target: number; // 99.9
  overall_sla_met: boolean;
  services_breached_count: number;
  services_total_count: number;
  date_range: { start: string; end: string } | null;
  services: ServiceStats[];
  upload_id: string;
  is_filtered?: boolean;
  filter_description?: string | null;
}

export type SortField =
  | "timestamp"
  | "service"
  | "status"
  | "latency"
  | "agent"
  | "region";

export type SortOrder = "asc" | "desc";

// Logs query parameters
export interface LogsQuery {
  page?: number;
  page_size?: number;
  date?: string; // single date YYYY-MM-DD
  date_from?: string; // range start YYYY-MM-DD
  date_to?: string; // range end YYYY-MM-DD
  time_from?: string; // time start HH:mm (UTC)
  time_to?: string; // time end HH:mm (UTC)
  service_id?: string;
  sort_by?: SortField;
  sort_order?: SortOrder;
}

// Logs API response
export interface LogsResponse {
  data: DBMonitoringCheck[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  sort_by: SortField;
  sort_order: SortOrder;
}
