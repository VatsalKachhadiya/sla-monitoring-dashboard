import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { parseFilterParams, applyFiltersToQuery } from "@/lib/filter-utils";
import type { LogsResponse, SortField, SortOrder } from "@/types";

/**
 * Map API sort field keys to database column names.
 */
const SORT_COLUMN_MAP: Record<SortField, string> = {
  timestamp: "timestamp",
  service: "service_name",
  status: "status_code",
  latency: "latency_ms",
  agent: "agent",
  region: "region",
};

/**
 * GET /api/logs
 *
 * Fetches monitoring check logs with server-side pagination, date & time filtering,
 * and column sorting.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse and validate date/time/service filters
    const filterParams = parseFilterParams(searchParams);
    if (filterParams.validationError) {
      return NextResponse.json(
        { error: filterParams.validationError },
        { status: 400 }
      );
    }

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(
      200,
      Math.max(1, parseInt(searchParams.get("page_size") || "50", 10))
    );

    // Sorting parameters
    const rawSortBy = searchParams.get("sort_by")?.toLowerCase() as SortField;
    const sortBy: SortField = rawSortBy && SORT_COLUMN_MAP[rawSortBy] ? rawSortBy : "timestamp";
    const rawSortOrder = searchParams.get("sort_order")?.toLowerCase();
    const sortOrder: SortOrder = rawSortOrder === "asc" ? "asc" : "desc";

    const supabase = createServerSupabaseClient();

    // Base query
    let query = supabase
      .from("monitoring_checks")
      .select("*", { count: "exact" });

    // Apply date/time/service filters
    query = applyFiltersToQuery(query, filterParams);

    // Apply server-side ordering
    const dbColumn = SORT_COLUMN_MAP[sortBy];
    query = query.order(dbColumn, {
      ascending: sortOrder === "asc",
      nullsFirst: false,
    });

    // Secondary sort tiebreaker for deterministic pagination
    if (sortBy !== "timestamp") {
      query = query.order("timestamp", { ascending: false });
    }

    // Apply pagination range
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
      sort_by: sortBy,
      sort_order: sortOrder,
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
