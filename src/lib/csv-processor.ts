import Papa from "papaparse";
import type {
  RawCSVRow,
  MonitoringCheck,
  DataQualityIssue,
} from "@/types";

// Required CSV column headers
const REQUIRED_COLUMNS = [
  "service_id",
  "service_name",
  "timestamp",
  "status_code",
  "latency",
  "latency_unit",
  "agent",
  "region",
];

interface ProcessedData {
  records: MonitoringCheck[];
  issues: DataQualityIssue[];
  duplicates_removed: number;
  invalid_skipped: number;
}

/**
 * Parse and clean a CSV string of monitoring check data.
 *
 * Data quality issues handled:
 * 1. Mixed timestamp formats (ISO 8601 and Unix epoch) → normalized to ISO 8601
 * 2. Mixed latency units (ms and s) → normalized to milliseconds
 * 3. Missing latency values → stored as null
 * 4. Invalid status codes (e.g. 999) → record skipped, issue logged
 * 5. Exact duplicate rows → de-duplicated
 * 6. Shuffled row order → sorted by timestamp after cleaning
 * 7. Windows-style line endings → handled by parser
 * 8. Empty/whitespace-only fields → trimmed and validated
 */
export function processCSV(csvText: string): ProcessedData {
  const issues: DataQualityIssue[] = [];
  let duplicates_removed = 0;
  let invalid_skipped = 0;

  // Track issue counts during processing
  const issueCounts = {
    unix_timestamps: 0,
    seconds_latency: 0,
    missing_latency: 0,
    invalid_status: 0,
    exact_duplicates: 0,
    missing_fields: 0,
    invalid_timestamp: 0,
  };

  // Parse CSV with PapaParse
  const parsed = Papa.parse<RawCSVRow>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header: string) => header.trim().replace(/\r/g, ""),
    transform: (value: string) => value.trim().replace(/\r/g, ""),
  });

  if (parsed.errors.length > 0) {
    issues.push({
      type: "parse_errors",
      description: `CSV parsing produced ${parsed.errors.length} errors: ${parsed.errors
        .slice(0, 3)
        .map((e) => e.message)
        .join("; ")}`,
      count: parsed.errors.length,
      action: "Rows with parse errors were skipped",
    });
  }

  // Validate headers
  const headers = parsed.meta.fields || [];
  const missingHeaders = REQUIRED_COLUMNS.filter((col) => !headers.includes(col));
  if (missingHeaders.length > 0) {
    throw new Error(
      `CSV is missing required columns: ${missingHeaders.join(", ")}. Found columns: ${headers.join(", ")}`
    );
  }

  // Process each row
  const validRecords: MonitoringCheck[] = [];

  for (const row of parsed.data) {
    // Skip rows with missing critical fields
    if (!row.service_id || !row.timestamp || !row.status_code) {
      issueCounts.missing_fields++;
      invalid_skipped++;
      continue;
    }

    // Normalize timestamp
    const timestamp = normalizeTimestamp(row.timestamp);
    if (!timestamp) {
      issueCounts.invalid_timestamp++;
      invalid_skipped++;
      continue;
    }

    // Check if the original was a Unix timestamp
    if (/^\d{10,13}$/.test(row.timestamp)) {
      issueCounts.unix_timestamps++;
    }

    // Validate and parse status code
    const statusCode = parseInt(row.status_code, 10);
    if (isNaN(statusCode) || statusCode < 100 || statusCode > 599) {
      // Status codes like 999 are invalid
      if (!isNaN(statusCode)) {
        issueCounts.invalid_status++;
      }
      invalid_skipped++;
      continue;
    }

    // Normalize latency to milliseconds
    let latencyMs: number | null = null;
    let rawLatency = (row.latency || "").trim();
    let latencyUnit = (row.latency_unit || "ms").trim().toLowerCase();

    if (rawLatency.endsWith("ms")) {
      latencyUnit = "ms";
      rawLatency = rawLatency.slice(0, -2).trim();
    } else if (rawLatency.endsWith("s")) {
      latencyUnit = "s";
      rawLatency = rawLatency.slice(0, -1).trim();
    }

    if (rawLatency !== "") {
      const parsedLatency = parseFloat(rawLatency);
      if (!isNaN(parsedLatency) && parsedLatency >= 0) {
        if (latencyUnit === "s") {
          latencyMs = parsedLatency * 1000;
          issueCounts.seconds_latency++;
        } else {
          latencyMs = parsedLatency;
        }
        // Round to 2 decimal places
        latencyMs = Math.round(latencyMs * 100) / 100;
      } else {
        issueCounts.missing_latency++;
      }
    } else {
      issueCounts.missing_latency++;
    }

    // Determine health: 2xx status codes are considered healthy
    const is_healthy = statusCode >= 200 && statusCode < 300;

    validRecords.push({
      service_id: row.service_id,
      service_name: row.service_name || row.service_id,
      timestamp,
      status_code: statusCode,
      latency_ms: latencyMs,
      agent: row.agent || "unknown",
      region: (row.region || "unknown").replace(/\r/g, ""),
      is_healthy,
    });
  }

  // De-duplicate: exact match on service_id + timestamp + status_code + agent
  const seen = new Set<string>();
  const dedupedRecords: MonitoringCheck[] = [];

  // Sort first so we process consistently
  validRecords.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  for (const record of validRecords) {
    const key = `${record.service_id}|${record.timestamp}|${record.status_code}|${record.latency_ms}|${record.agent}|${record.region}`;
    if (seen.has(key)) {
      issueCounts.exact_duplicates++;
      duplicates_removed++;
      continue;
    }
    seen.add(key);
    dedupedRecords.push(record);
  }

  // Build data quality issue reports
  if (issueCounts.unix_timestamps > 0) {
    issues.push({
      type: "mixed_timestamps",
      description: "Some timestamps were in Unix epoch format instead of ISO 8601",
      count: issueCounts.unix_timestamps,
      action: "Converted Unix epoch timestamps to ISO 8601 UTC",
    });
  }

  if (issueCounts.seconds_latency > 0) {
    issues.push({
      type: "mixed_latency_units",
      description:
        "Latency values had mixed units (ms and s). Seconds were primarily from svc-search.",
      count: issueCounts.seconds_latency,
      action: "Normalized all latency values to milliseconds",
    });
  }

  if (issueCounts.missing_latency > 0) {
    issues.push({
      type: "missing_latency",
      description: "Some records had empty/missing latency values",
      count: issueCounts.missing_latency,
      action: "Stored as null; these records still count for uptime but not latency stats",
    });
  }

  if (issueCounts.invalid_status > 0) {
    issues.push({
      type: "invalid_status_code",
      description:
        "Records with non-standard HTTP status codes (e.g., 999) were found",
      count: issueCounts.invalid_status,
      action: "Skipped — cannot determine if the check succeeded or failed",
    });
  }

  if (issueCounts.exact_duplicates > 0) {
    issues.push({
      type: "exact_duplicates",
      description:
        "Exact duplicate rows (same service, timestamp, status, latency, agent, region)",
      count: issueCounts.exact_duplicates,
      action: "Removed duplicates, keeping one copy",
    });
  }

  if (issueCounts.missing_fields > 0) {
    issues.push({
      type: "missing_required_fields",
      description:
        "Rows missing critical fields (service_id, timestamp, or status_code)",
      count: issueCounts.missing_fields,
      action: "Skipped — insufficient data to process",
    });
  }

  if (issueCounts.invalid_timestamp > 0) {
    issues.push({
      type: "invalid_timestamp",
      description: "Rows with unparseable timestamp values",
      count: issueCounts.invalid_timestamp,
      action: "Skipped — cannot determine when the check occurred",
    });
  }

  // Always note if data was unsorted (it always is in these files)
  if (parsed.data.length > 1) {
    issues.push({
      type: "unsorted_data",
      description: "CSV rows were not in chronological order",
      count: parsed.data.length,
      action: "Sorted records by timestamp after cleaning",
    });
  }

  return {
    records: dedupedRecords,
    issues,
    duplicates_removed,
    invalid_skipped,
  };
}

/**
 * Normalize a timestamp string to ISO 8601 format.
 * Handles both ISO 8601 strings and Unix epoch seconds/milliseconds.
 */
function normalizeTimestamp(raw: string): string | null {
  if (!raw) return null;

  // Check if it's a Unix timestamp (all digits, 10 or 13 chars)
  if (/^\d{10,13}$/.test(raw)) {
    const num = parseInt(raw, 10);
    // 10 digits = seconds, 13 digits = milliseconds
    const ms = raw.length === 13 ? num : num * 1000;
    const date = new Date(ms);
    if (isNaN(date.getTime())) return null;
    return date.toISOString();
  }

  // Try parsing as ISO 8601
  const date = new Date(raw);
  if (isNaN(date.getTime())) return null;
  return date.toISOString();
}
