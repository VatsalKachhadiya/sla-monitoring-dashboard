import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { parseFilterParams, applyFiltersToQuery } from "@/lib/filter-utils";
import type { OverallStats, ServiceStats } from "@/types";

/**
 * GET /api/stats
 *
 * Computes SLA statistics from persisted monitoring check data.
 * Supports optional date, time, and service filtering so stats dynamically
 * reflect the selected analysis window.
 */
interface CheckRow {
  upload_id: string;
  service_id: string;
  service_name: string;
  timestamp: string;
  status_code: number;
  latency_ms: number | null;
  is_healthy: boolean;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse and validate filter parameters
    const filterParams = parseFilterParams(searchParams);
    if (filterParams.validationError) {
      return NextResponse.json(
        { error: filterParams.validationError },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Fetch matching checks across all pages
    const checks: CheckRow[] = [];
    const PAGE_SIZE = 1000;
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      let query = supabase
        .from("monitoring_checks")
        .select(
          "upload_id, service_id, service_name, timestamp, status_code, latency_ms, is_healthy"
        )
        .order("timestamp", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      // Apply date, time, and service filters
      query = applyFiltersToQuery(query, filterParams);

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching checks for stats:", error);
        return NextResponse.json(
          { error: "Failed to fetch monitoring data for statistics" },
          { status: 500 }
        );
      }

      if (!data || data.length === 0) {
        hasMore = false;
      } else {
        checks.push(...data);
        if (data.length < PAGE_SIZE) {
          hasMore = false;
        } else {
          from += PAGE_SIZE;
        }
      }
    }

    // Handle empty results
    if (!checks || checks.length === 0) {
      if (filterParams.hasFilters) {
        // Filter returned 0 results
        const emptyStats: OverallStats = {
          total_checks: 0,
          successful_checks: 0,
          failed_checks: 0,
          overall_availability_pct: 0,
          sla_target: 99.9,
          overall_sla_met: false,
          services_breached_count: 0,
          services_total_count: 0,
          date_range: null,
          services: [],
          upload_id: "",
          is_filtered: true,
          filter_description: filterParams.filterDescription,
        };
        return NextResponse.json(emptyStats, { status: 200 });
      }

      return NextResponse.json(
        { error: "No monitoring data found. Please upload a CSV first." },
        { status: 404 }
      );
    }

    // Group checks by service
    const serviceMap = new Map<
      string,
      {
        service_name: string;
        checks: CheckRow[];
      }
    >();

    for (const check of checks) {
      if (!serviceMap.has(check.service_id)) {
        serviceMap.set(check.service_id, {
          service_name: check.service_name,
          checks: [],
        });
      }
      serviceMap.get(check.service_id)!.checks.push(check);
    }

    // Compute per-service statistics
    const SLA_TARGET = 99.9;
    const services: ServiceStats[] = [];

    let totalChecks = 0;
    let totalSuccessful = 0;
    let totalFailed = 0;

    for (const [serviceId, { service_name, checks: serviceChecks }] of serviceMap) {
      const successful = serviceChecks.filter((c) => c.is_healthy).length;
      const failed = serviceChecks.length - successful;
      const availability = (successful / serviceChecks.length) * 100;

      // Latency stats (only from records with latency data)
      const latencies = serviceChecks
        .map((c) => c.latency_ms)
        .filter((l): l is number => l !== null && l !== undefined)
        .sort((a, b) => a - b);

      const avgLatency =
        latencies.length > 0
          ? Math.round(
              (latencies.reduce((a, b) => a + b, 0) / latencies.length) * 100
            ) / 100
          : null;

      const p50 = latencies.length > 0 ? percentile(latencies, 50) : null;
      const p95 = latencies.length > 0 ? percentile(latencies, 95) : null;
      const p99 = latencies.length > 0 ? percentile(latencies, 99) : null;

      // Find worst day
      const dayMap = new Map<string, { total: number; healthy: number }>();
      for (const check of serviceChecks) {
        const day = check.timestamp.substring(0, 10); // YYYY-MM-DD
        if (!dayMap.has(day)) {
          dayMap.set(day, { total: 0, healthy: 0 });
        }
        const d = dayMap.get(day)!;
        d.total++;
        if (check.is_healthy) d.healthy++;
      }

      let worstDay: string | null = null;
      let worstDayAvailability: number | null = null;
      for (const [day, { total, healthy }] of dayMap) {
        const dayAvail = (healthy / total) * 100;
        if (worstDayAvailability === null || dayAvail < worstDayAvailability) {
          worstDay = day;
          worstDayAvailability = Math.round(dayAvail * 1000) / 1000;
        }
      }

      services.push({
        service_id: serviceId,
        service_name,
        total_checks: serviceChecks.length,
        successful_checks: successful,
        failed_checks: failed,
        availability_pct: Math.round(availability * 1000) / 1000,
        sla_met: availability >= SLA_TARGET,
        avg_latency_ms: avgLatency,
        p50_latency_ms: p50,
        p95_latency_ms: p95,
        p99_latency_ms: p99,
        worst_day: worstDay,
        worst_day_availability: worstDayAvailability,
      });

      totalChecks += serviceChecks.length;
      totalSuccessful += successful;
      totalFailed += failed;
    }

    // Sort services by availability (worst first)
    services.sort((a, b) => a.availability_pct - b.availability_pct);

    // Date range
    const dateRange =
      checks.length > 0
        ? {
            start: checks[0].timestamp,
            end: checks[checks.length - 1].timestamp,
          }
        : null;

    const upload_id = checks[0]?.upload_id || "";
    const overallAvailability =
      Math.round((totalSuccessful / totalChecks) * 100 * 1000) / 1000;
    const servicesBreached = services.filter((s) => !s.sla_met).length;

    const stats: OverallStats = {
      total_checks: totalChecks,
      successful_checks: totalSuccessful,
      failed_checks: totalFailed,
      overall_availability_pct: overallAvailability,
      sla_target: SLA_TARGET,
      overall_sla_met: overallAvailability >= SLA_TARGET,
      services_breached_count: servicesBreached,
      services_total_count: services.length,
      date_range: dateRange,
      services,
      upload_id,
      is_filtered: filterParams.hasFilters,
      filter_description: filterParams.filterDescription,
    };

    return NextResponse.json(stats, { status: 200 });
  } catch (error) {
    console.error("Stats error:", error);
    return NextResponse.json(
      { error: "Failed to compute statistics" },
      { status: 500 }
    );
  }
}

/**
 * Compute a percentile from a sorted array of numbers.
 */
function percentile(sorted: number[], p: number): number {
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return Math.round(sorted[lower] * 100) / 100;
  const weight = index - lower;
  return (
    Math.round((sorted[lower] * (1 - weight) + sorted[upper] * weight) * 100) /
    100
  );
}
