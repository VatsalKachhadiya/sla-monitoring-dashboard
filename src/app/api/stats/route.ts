import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import type { OverallStats, ServiceStats } from "@/types";

/**
 * GET /api/stats
 *
 * Computes SLA statistics from persisted monitoring check data.
 *
 * SLA Definition:
 * - A check is "successful" if its HTTP status code is in the 2xx range (200-299).
 * - Any non-2xx status code (4xx, 5xx) is considered a failure.
 * - Availability = (successful checks / total checks) × 100
 * - SLA target is 99.9%. If availability < 99.9%, the SLA is breached for that service.
 *
 * Latency statistics are computed only from records that have non-null latency values.
 * Records with missing latency still count toward uptime calculations.
 */
export async function GET() {
  try {
    const supabase = createServerSupabaseClient();

    // Fetch all monitoring checks across all pages (bypasses PostgREST 1000 row default limit)
    // Only select columns needed for SLA calculations to minimize bandwidth
    const checks: any[] = [];
    const PAGE_SIZE = 1000;
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from("monitoring_checks")
        .select("upload_id, service_id, service_name, timestamp, status_code, latency_ms, is_healthy")
        .order("timestamp", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        console.error("Error fetching checks:", error);
        return NextResponse.json(
          { error: "Failed to fetch monitoring data" },
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

    if (!checks || checks.length === 0) {
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
        checks: typeof checks;
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

    const stats: OverallStats = {
      total_checks: totalChecks,
      successful_checks: totalSuccessful,
      failed_checks: totalFailed,
      overall_availability_pct:
        Math.round((totalSuccessful / totalChecks) * 100 * 1000) / 1000,
      sla_target: SLA_TARGET,
      date_range: dateRange,
      services,
      upload_id,
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
