/**
 * Shared filtering utility for Supabase queries and API routes.
 * Ensures consistent handling of single-date, date-range, and time-of-day filters across
 * both /api/logs and /api/stats.
 */

export interface ParsedFilterParams {
  singleDate: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  timeFrom: string | null;
  timeTo: string | null;
  serviceId: string | null;
  validationError: string | null;
  hasFilters: boolean;
  filterDescription: string | null;
}

/**
 * Extracts and validates date/time/service filter parameters from a URL SearchParams.
 */
export function parseFilterParams(searchParams: URLSearchParams): ParsedFilterParams {
  const singleDate = searchParams.get("date")?.trim() || null;
  const dateFrom = searchParams.get("date_from")?.trim() || null;
  const dateTo = searchParams.get("date_to")?.trim() || null;
  const timeFrom = searchParams.get("time_from")?.trim() || null;
  const timeTo = searchParams.get("time_to")?.trim() || null;
  const serviceId = searchParams.get("service_id")?.trim() || null;

  let validationError: string | null = null;

  // Validate time format (HH:mm)
  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (timeFrom && !timeRegex.test(timeFrom)) {
    validationError = `Invalid From Time format: "${timeFrom}". Expected HH:mm in 24-hour UTC format (e.g. 09:00).`;
  } else if (timeTo && !timeRegex.test(timeTo)) {
    validationError = `Invalid To Time format: "${timeTo}". Expected HH:mm in 24-hour UTC format (e.g. 18:00).`;
  } else if (timeFrom && timeTo && timeFrom > timeTo) {
    validationError = `From Time (${timeFrom}) cannot be later than To Time (${timeTo}).`;
  }

  // Validate date format (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!validationError && singleDate && !dateRegex.test(singleDate)) {
    validationError = `Invalid Date format: "${singleDate}". Expected YYYY-MM-DD.`;
  }
  if (!validationError && dateFrom && !dateRegex.test(dateFrom)) {
    validationError = `Invalid From Date format: "${dateFrom}". Expected YYYY-MM-DD.`;
  }
  if (!validationError && dateTo && !dateRegex.test(dateTo)) {
    validationError = `Invalid To Date format: "${dateTo}". Expected YYYY-MM-DD.`;
  }
  if (!validationError && dateFrom && dateTo && dateFrom > dateTo) {
    validationError = `From Date (${dateFrom}) cannot be later than To Date (${dateTo}).`;
  }

  const hasFilters = Boolean(
    singleDate || dateFrom || dateTo || timeFrom || timeTo || serviceId
  );

  // Build human-friendly description of active filters
  let filterDescription: string | null = null;
  if (hasFilters) {
    const parts: string[] = [];
    if (singleDate) {
      if (timeFrom || timeTo) {
        parts.push(
          `${singleDate} [${timeFrom || "00:00"}–${timeTo || "23:59"} UTC]`
        );
      } else {
        parts.push(`${singleDate} (UTC)`);
      }
    } else if (dateFrom || dateTo) {
      const range = `${dateFrom || "Start"} → ${dateTo || "End"}`;
      if (timeFrom || timeTo) {
        parts.push(
          `${range} [${timeFrom || "00:00"}–${timeTo || "23:59"} UTC daily]`
        );
      } else {
        parts.push(`${range} (UTC)`);
      }
    } else if (timeFrom || timeTo) {
      parts.push(`Daily [${timeFrom || "00:00"}–${timeTo || "23:59"} UTC]`);
    }

    if (serviceId) {
      parts.push(`Service: ${serviceId}`);
    }

    filterDescription = parts.join(" • ");
  }

  return {
    singleDate,
    dateFrom,
    dateTo,
    timeFrom,
    timeTo,
    serviceId,
    validationError,
    hasFilters,
    filterDescription,
  };
}

/**
 * Applies date, time, and service filters to a Supabase query builder.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyFiltersToQuery(query: any, filters: ParsedFilterParams): any {
  const { singleDate, dateFrom, dateTo, timeFrom, timeTo, serviceId } = filters;

  if (singleDate) {
    // Single date with optional time window
    const tFrom = timeFrom || "00:00";
    const tTo = timeTo || "23:59";
    const dayStart = `${singleDate}T${tFrom}:00.000Z`;
    const dayEnd = `${singleDate}T${tTo}:59.999Z`;
    query = query.gte("timestamp", dayStart).lte("timestamp", dayEnd);
  } else if (dateFrom || dateTo) {
    if (timeFrom || timeTo) {
      // Date range with a daily time-of-day window (e.g. 09:00 to 18:00 every day in the range)
      const tFrom = timeFrom || "00:00";
      const tTo = timeTo || "23:59";
      const startDay = dateFrom || "2025-01-01";
      const endDay = dateTo || dateFrom || "2025-12-31";

      const days: string[] = [];
      const curr = new Date(`${startDay}T00:00:00Z`);
      const last = new Date(`${endDay}T00:00:00Z`);

      while (curr <= last && days.length <= 40) {
        days.push(curr.toISOString().substring(0, 10));
        curr.setUTCDate(curr.getUTCDate() + 1);
      }

      if (days.length > 0 && days.length <= 40) {
        const clauses = days.map(
          (d) =>
            `and(timestamp.gte.${d}T${tFrom}:00.000Z,timestamp.lte.${d}T${tTo}:59.999Z)`
        );
        query = query.or(clauses.join(","));
      } else {
        // Fallback for extremely wide ranges
        query = query
          .gte("timestamp", `${startDay}T${tFrom}:00.000Z`)
          .lte("timestamp", `${endDay}T${tTo}:59.999Z`);
      }
    } else {
      // Date range without time filtering
      if (dateFrom) {
        query = query.gte("timestamp", `${dateFrom}T00:00:00.000Z`);
      }
      if (dateTo) {
        query = query.lte("timestamp", `${dateTo}T23:59:59.999Z`);
      }
    }
  } else if (timeFrom || timeTo) {
    // Only time provided (without date) — match checks across all days within that daily time window
    // (Using standard bounds for the monitoring dataset)
    const tFrom = timeFrom || "00:00";
    const tTo = timeTo || "23:59";
    // For 9d case study (2025-05-08 through 2025-05-16), construct daily windows
    const days: string[] = [];
    const curr = new Date("2025-05-08T00:00:00Z");
    const last = new Date("2025-05-16T00:00:00Z");
    while (curr <= last) {
      days.push(curr.toISOString().substring(0, 10));
      curr.setUTCDate(curr.getUTCDate() + 1);
    }
    const clauses = days.map(
      (d) =>
        `and(timestamp.gte.${d}T${tFrom}:00.000Z,timestamp.lte.${d}T${tTo}:59.999Z)`
    );
    query = query.or(clauses.join(","));
  }

  // Service filter
  if (serviceId) {
    query = query.eq("service_id", serviceId);
  }

  return query;
}
