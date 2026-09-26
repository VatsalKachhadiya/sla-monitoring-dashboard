import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import type { LogsResponse } from "@/types";

/**
 * GET /api/logs
 *
 * Fetches monitoring check logs with pagination and date filtering.
 *
 * Query parameters:
 * - page (default: 1)
 * - page_size (default: 50, max: 200)
 * - date: single date filter (YYYY-MM-DD) — shows logs for that entire day
 * - date_from: range start (YYYY-MM-DD)
 * - date_to: range end (YYYY-MM-DD)
 * - service_id: filter by service
 *
 * If both `date` and `date_from`/`date_to` are provided, `date` takes precedence.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(
      200,
      Math.max(1, parseInt(searchParams.get("page_size") || "50", 10))
    );
    const singleDate = searchParams.get("date");
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");
    const serviceId = searchParams.get("service_id");

    const supabase = createServerSupabaseClient();

    // Build query
    let query = supabase
      .from("monitoring_checks")
      .select("*", { count: "exact" });

    // Apply date filters
    if (singleDate) {
      // Single date: filter for the entire day in UTC
      const dayStart = `${singleDate}T00:00:00.000Z`;
      const dayEnd = `${singleDate}T23:59:59.999Z`;
      query = query.gte("timestamp", dayStart).lte("timestamp", dayEnd);
    } else {
      if (dateFrom) {
        query = query.gte("timestamp", `${dateFrom}T00:00:00.000Z`);
      }
      if (dateTo) {
        query = query.lte("timestamp", `${dateTo}T23:59:59.999Z`);
      }
    }

    // Apply service filter
    if (serviceId) {
      query = query.eq("service_id", serviceId);
    }

    // Order by timestamp descending (most recent first)
    query = query.order("timestamp", { ascending: false });

    // Apply pagination
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error("Error fetching logs:", error);
      return NextResponse.json(
        { error: "Failed to fetch logs" },
        { status: 500 }
      );
    }

    const total = count || 0;
    const totalPages = Math.ceil(total / pageSize);

    const response: LogsResponse = {
      data: data || [],
      total,
      page,
      page_size: pageSize,
      total_pages: totalPages,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error("Logs error:", error);
    return NextResponse.json(
      { error: "Failed to fetch logs" },
      { status: 500 }
    );
  }
}
