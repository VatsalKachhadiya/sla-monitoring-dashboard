import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { processCSV } from "@/lib/csv-processor";
import type { ProcessingResult } from "@/types";
import { randomUUID } from "crypto";

// Vercel serverless function config — allow up to 60s for large CSV processing
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    // Read the uploaded file from form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided" } as Partial<ProcessingResult>,
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.name.endsWith(".csv") && file.type !== "text/csv") {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid file type. Please upload a CSV file.",
        } as Partial<ProcessingResult>,
        { status: 400 }
      );
    }

    // Read file content
    const csvText = await file.text();

    if (!csvText.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: "The uploaded CSV file is empty.",
        } as Partial<ProcessingResult>,
        { status: 400 }
      );
    }

    // Process and clean the CSV
    const { records, issues, duplicates_removed, invalid_skipped } =
      processCSV(csvText);

    if (records.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No valid records found in the CSV after processing. Check that the file has the correct format.",
          data_quality_issues: issues,
        } as Partial<ProcessingResult>,
        { status: 400 }
      );
    }

    // Generate upload ID for traceability
    const upload_id = randomUUID();

    // Initialize Supabase client
    const supabase = createServerSupabaseClient();

    // Clear previous data (each upload replaces the existing dataset)
    const { error: deleteError } = await supabase
      .from("monitoring_checks")
      .delete()
      .neq("id", 0); // delete all rows

    if (deleteError) {
      console.error("Error clearing existing data:", deleteError);
      return NextResponse.json(
        {
          success: false,
          error: "Failed to clear existing data before insert.",
        } as Partial<ProcessingResult>,
        { status: 500 }
      );
    }

    // Insert cleaned records in batches of 500
    const BATCH_SIZE = 500;
    let insertedCount = 0;

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE).map((record) => ({
        upload_id,
        service_id: record.service_id,
        service_name: record.service_name,
        timestamp: record.timestamp,
        status_code: record.status_code,
        latency_ms: record.latency_ms,
        agent: record.agent,
        region: record.region,
        is_healthy: record.is_healthy,
      }));

      const { error: insertError } = await supabase
        .from("monitoring_checks")
        .insert(batch);

      if (insertError) {
        console.error(
          `Error inserting batch ${i / BATCH_SIZE + 1}:`,
          insertError
        );
        return NextResponse.json(
          {
            success: false,
            error: `Database insert failed at batch ${i / BATCH_SIZE + 1}: ${insertError.message}`,
          } as Partial<ProcessingResult>,
          { status: 500 }
        );
      }
      insertedCount += batch.length;
    }

    // Compute date range from the cleaned records
    const timestamps = records.map((r) => r.timestamp).sort();
    const dateRange =
      timestamps.length > 0
        ? { start: timestamps[0], end: timestamps[timestamps.length - 1] }
        : null;

    // Unique services
    const servicesFound = [...new Set(records.map((r) => r.service_id))].sort();

    const totalRowsParsed = records.length + duplicates_removed + invalid_skipped;

    const result: ProcessingResult = {
      success: true,
      upload_id,
      total_rows_parsed: totalRowsParsed,
      valid_records_inserted: insertedCount,
      duplicates_removed,
      invalid_records_skipped: invalid_skipped,
      data_quality_issues: issues,
      date_range: dateRange,
      services_found: servicesFound,
    };

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("Upload processing error:", error);
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json(
      { success: false, error: message } as Partial<ProcessingResult>,
      { status: 500 }
    );
  }
}
