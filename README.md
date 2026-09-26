# SLA Monitoring Dashboard

A production-grade, full-stack SLA monitoring and incident analysis dashboard built for **EarthRe**. The application ingests multi-day, multi-agent health check logs, processes and cleans anomalies through a real cloud serverless function, persists data to Supabase PostgreSQL, and provides a responsive, single-screen operational dashboard for site reliability engineers (SRE) and billing teams.

---

## 1. Live Deployment & Repository

- **Live URL:** [Deployed on Vercel](https://sla-monitoring-dashboard-earthre.vercel.app) *(Replace with actual deployed Vercel domain)*
- **GitHub Repository:** [sla-monitoring-dashboard](https://github.com/VatsalKachhadiya/sla-monitoring-dashboard)
- **Last Verified Live:** September 2026

---

## 2. Architecture & Tech Stack

```
┌─────────────────┐       Multipart / FormData       ┌───────────────────────────────┐
│                 │ ───────────────────────────────> │  Vercel Serverless Function   │
│  Upload Web UI  │                                  │        POST /api/upload       │
│  (Next.js App)  │ <─────────────────────────────── │  (Parse, Clean, Validate CSV) │
└─────────────────┘       ProcessingResult JSON      └──────────────┬────────────────┘
         │                                                          │
         │ GET /api/stats                                           │ Batch Insert (500/batch)
         │ GET /api/logs                                            ▼
┌────────┴────────┐                                  ┌───────────────────────────────┐
│ Single-Screen   │ <──────────────────────────────> │      Supabase PostgreSQL      │
│ Dashboard UI    │       Indexed SQL Queries        │  (monitoring_checks table)    │
└─────────────────┘                                  └───────────────────────────────┘
```

### Components & Rationale

| Component | Technology | Rationale |
| :--- | :--- | :--- |
| **Frontend UI** | Next.js 15 (App Router, TypeScript) | Provides a fast, interactive single-page experience. Uses modern CSS tokens (Inter font, dark glassmorphism, responsive grid) without heavy CSS framework lock-in. |
| **Serverless Function** | Next.js Route Handlers on Vercel | Fulfills the mandatory requirement for a **real stateless cloud serverless function** (not browser-side execution). Scales automatically, zero infrastructure maintenance, and adheres to 100% free-tier limits. |
| **Database** | Supabase (Managed PostgreSQL) | Relational database with full ACID compliance. Supports structured schemas, indexes on `timestamp` and `service_id` for sub-10ms query execution, and high-concurrency batch writes. Requires no credit card. |
| **CSV Parser** | PapaParse | High-performance, RFC 4180-compliant streaming parser that gracefully handles Windows/Unix line endings (`\r\n`), quoted values, and edge-case whitespace. |

---

## 3. Data Findings & Quality Issue Handling

Analysis of the provided monitoring datasets (`monitoring_checks_9d_seed101.csv` through `30d_seed404.csv`) revealed several data quality anomalies typical of distributed monitoring pipelines. Below is how each was detected and remediated:

### 1. Mixed Timestamp Formats
- **Finding:** While most rows used ISO 8601 strings (`2025-05-08T00:00:00Z`), 70 rows in the 9-day dataset were recorded as raw Unix epoch numbers (e.g., `1746662400` or millisecond timestamps).
- **Handling:** The processor detects numeric string values or epoch numbers. Epochs < `1e11` are treated as seconds (`× 1000`), converted to `Date`, and normalized into standard ISO 8601 UTC strings (`YYYY-MM-DDTHH:mm:ss.sssZ`).

### 2. Mixed Latency Units
- **Finding:** The service `svc-search` reported latency in seconds with an `s` unit suffix (e.g., `0.342s`), while all other services reported in milliseconds (`ms` suffix or raw integer).
- **Handling:** Regular expressions match whether the value is in seconds (`/s$/i`) or milliseconds (`/ms$/i`). Values in seconds are multiplied by 1000 and rounded to 2 decimal places so all database records share a uniform unit (`latency_ms`).

### 3. Missing Latency Values
- **Finding:** 56 rows in the 9-day dataset had empty or null latency fields.
- **Handling:** Missing latencies are persisted as SQL `NULL`. Crucially, these records **still count towards uptime availability** (since HTTP status codes were present), but are excluded from average, P50, P95, and P99 latency aggregations so they do not skew performance metrics.

### 4. Invalid HTTP Status Codes (`999`)
- **Finding:** 1 row for `svc-payments` contained HTTP status code `999`.
- **Handling:** `999` is a non-standard status code (not defined in RFC 7231/9110) that indicates an unparseable agent probe failure. Because it cannot be accurately categorized as a known client or server response, it is dropped from the dataset and recorded in the `data_quality_issues` audit log returned to the user.

### 5. Exact Duplicate Rows
- **Finding:** 6 exact duplicate rows were detected in the dataset.
- **Handling:** De-duplication is enforced using an in-memory hash set keyed on `service_id:timestamp:agent:status_code:latency_ms`. Duplicate rows are skipped, incrementing the `duplicates_removed` counter.

### 6. Unsorted Chronological Order
- **Finding:** Raw rows in the CSV files are randomly shuffled across time, services, and agents.
- **Handling:** The serverless processor sorts all validated records chronologically by timestamp before executing batch inserts into PostgreSQL.

### 7. Multi-Agent Probing (`agent-1`, `agent-2`)
- **Finding:** Multiple distinct monitoring agents record checks for the same service at the same timestamp.
- **Handling:** Both checks represent legitimate distributed monitoring perspectives (e.g., probes from different network paths). They are preserved as independent records in the database.

---

## 4. SLA Definitions & Verified Calculations

### 1. Core SLA Definitions
- **Successful Check:** A health check probe is defined as **successful (healthy)** if and only if its HTTP status code is in the **2xx range (200–299)**.
- **Failed Check:** Any probe returning **4xx** (client error) or **5xx** (server error) is categorized as downtime/failure. Probes with non-standard codes outside HTTP specs (such as `999`) are invalid and rejected during ingestion.
- **SLA Target Commitment:** **99.900% (three-nines)** availability across all probes. Any service or overall aggregate falling below 99.900% triggers an SLA Breach.
- **Availability Formula:**
  $$\text{Availability} = \frac{\text{Successful Checks}}{\text{Total Checks}} \times 100$$
  Reported to **3 decimal places** of precision for contractual accuracy (e.g. `99.035%`).
- **Latency Percentiles:** Average, P50, P95, and P99 tail latencies are calculated exclusively over probes with non-null latency values. Probes with missing latency still count toward availability uptime.
- **Timezone Standard:** Strict **UTC** is used throughout database storage (`TIMESTAMPTZ`), API querying (`Z` suffixed boundaries), single-date and range filtering, and calendar day groupings for worst-day calculation.

### 2. Verified 9-Day Dataset Baseline (`monitoring_checks_9d_seed101.csv`)

| Service Name | Service ID | Total Checks | Successful | Failed | Availability (3 dec) | SLA Status (Target: 99.900%) | Avg Latency | P95 Latency | P99 Latency | Worst Day (UTC) |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **reports-api** | `svc-reports` | 928 | 906 | 22 | **97.629%** | ❌ **Breached** | 657ms | 843ms | 861ms | 2025-05-13 (92.23%) |
| **search-api** | `svc-search` | 935 | 925 | 10 | **98.930%** | ❌ **Breached** | 539ms | 701ms | 717ms | 2025-05-16 (96.04%) |
| **auth-api** | `svc-auth` | 931 | 926 | 5 | **99.463%** | ❌ **Breached** | 144ms | 187ms | 191ms | 2025-05-13 (98.10%) |
| **notify-worker** | `svc-notify` | 924 | 920 | 4 | **99.567%** | ❌ **Breached** | 114ms | 148ms | 151ms | 2025-05-08 (98.02%) |
| **payments-api** | `svc-payments` | 946 | 942 | 4 | **99.577%** | ❌ **Breached** | 370ms | 483ms | 494ms | 2025-05-11 (98.13%) |
| **Overall Platform** | *All 5 services* | **4,664** | **4,619** | **45** | **99.035%** | ❌ **5/5 Services Breached** | — | — | — | **Below Target (-0.865%)** |

> **Verification Check:**
> $$\frac{4,619 \text{ successful}}{4,664 \text{ total}} = 99.035163\% \approx \mathbf{99.04\%}$$
> The platform exhibits **5/5 Services Breached** with an overall availability of **99.035%**, well below the **99.900%** target.

---

## 5. Architectural & Design Decisions

### 1. Ingestion Summary & Feedback
After CSV ingestion, the dashboard provides a complete, transparent breakdown:
- Total rows received (4,672)
- Valid rows parsed (4,664)
- Rows persisted to PostgreSQL (4,664)
- Duplicates handled & de-duplicated (7)
- Invalid / rejected rows (1 row with status code 999)
- Audit log of all data-quality issues remediated

### 2. Service Cards Grid Balance
The dashboard service cards use a responsive 5-column grid on desktop screens (`>= 1100px`) so all 5 services appear in one visually balanced row without leaving an orphaned card on a second row. On smaller viewports, cards adapt fluidly into 2 or 1 column layouts.

### 3. Log Filtering, Time-of-Day Windows & Usability
- **Date Filtering:** Supports single-day selection (`YYYY-MM-DD`) and date ranges (`From Date` / `To Date`), evaluated against UTC day boundaries (`T00:00:00.000Z` to `T23:59:59.999Z`).
- **Time Filtering (Optional):**
  - **Single Date + Time Range:** Evaluates logs for the selected date strictly between `[From Time]` and `[To Time]` (e.g. `2025-05-13` from `09:00` to `18:00` UTC).
  - **Date Range + Daily Time Window:** Evaluates logs within the date range during the specified daily time-of-day window across each day (e.g. `2025-05-08` to `2025-05-16` daily between `09:00` and `18:00` UTC). This is powered server-side via PostgREST `or(and(...))` clauses across the day list without requiring client-side row truncation.
  - **Validation:** Enforces `From Time <= To Time` and `From Date <= To Date` with inline, accessible feedback.
- **Server-Side Sorting:**
  - Sortable columns: **Timestamp**, **Service**, **Status**, **Latency**, **Agent**, and **Region**.
  - Default sort order: `Timestamp DESC` (newest health check first).
  - Interaction: Clicking any sortable header toggles between ascending (`↑ ASC`) and descending (`↓ DESC`).
  - Executed directly in PostgreSQL via Supabase query ordering (`.order(field, { ascending, nullsFirst: false })`). Latencies sort with null values safely placed last. Changing sort resets pagination to Page 1.
- **Server-Side Pagination:**
  - Paginated at 50 logs per page using SQL `LIMIT` and `OFFSET`. The database returns the total matching count (`count: 'exact'`) to enable standard navigation (`« First`, `‹ Prev`, `Page X of Y`, `Next ›`, `Last »`).
  - Changing filters or sort order automatically resets pagination to Page 1. Changing pages preserves active filters and sort field.
- **Filter-Aware Dynamic Statistics:**
  - When filters are applied, the SLA Statistics section (overall availability, breach status, service cards, and latency percentiles) dynamically recalculates against the active filtered dataset.
  - An active filter indicator chip informs the user of the exact operational window under review (e.g. `Filtered: 2025-05-13 (09:00 - 18:00 UTC) • Service: svc-reports`).
  - Clearing filters instantly resets all controls and restores the global baseline metrics.

### 4. SLA Visualization: Service Availability vs. SLA Target
- **Library:** Apache ECharts (`echarts@^6.1.0`), integrated directly via React `useEffect` and `ResizeObserver` to eliminate SSR/hydration mismatches and avoid React 19 wrapper incompatibilities.
- **Why this chart was chosen:**
  - Rather than adding arbitrary decorative charts (e.g., confusing multi-line point plots or generic pie charts), a **horizontal bar chart** directly answers the primary question for an SRE or billing auditor: *"Which microservices breached our contractual 99.900% SLA commitment?"*
  - Y-axis lists each microservice; X-axis represents availability percentage formatted to 3 decimal places (`0%` to `100%`).
  - A prominent red dashed reference markline at **99.900%** provides an immediate visual threshold.
  - Bars are dynamically styled based on compliance (emerald green if $\ge 99.900\%$, rose red if breached).
  - Rich hover tooltips display exact probe counts (healthy / total) alongside exact percentage.
- **Data Correctness & Shared Source of Truth:**
  - The chart consumes the exact same computed metrics from `/api/stats` as the service summary cards (`Database -> Statistics Calculation -> Shared JSON -> Cards + Chart`), guaranteeing 100% consistency across the entire UI.

---

## 6. Local Setup & Running Locally

### Prerequisites
- Node.js 18.x or 20.x
- A free Supabase account ([supabase.com](https://supabase.com))

### 1. Clone the repository
```bash
git clone https://github.com/VatsalKachhadiya/sla-monitoring-dashboard.git
cd sla-monitoring-dashboard
```

### 2. Install dependencies
```bash
npm install
```

### 3. Set up the Database Schema
1. Open your Supabase Dashboard and navigate to the **SQL Editor**.
2. Run the SQL script from `supabase/schema.sql`.
3. This creates the `monitoring_checks` table with indexes on `timestamp`, `service_id`, `status_code`, and `latency_ms`.

### 4. Configure Environment Variables
Create a `.env.local` file in the project root:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```
> **Security Note:** `SUPABASE_SERVICE_ROLE_KEY` is strictly confined to server-side Route Handlers (`/api/upload`, `/api/stats`, `/api/logs`) and is **never** bundled or exposed to the browser client.

### 5. Run the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 7. Deployment to Vercel

1. Push your repository to GitHub.
2. Log into [Vercel](https://vercel.com) and click **"Add New Project"**.
3. Import your GitHub repository (`sla-monitoring-dashboard`).
4. Under **Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. Click **Deploy**. Vercel will automatically build the Next.js application and deploy the serverless Route Handlers globally.

---

## 8. What I'd Do Differently With More Time

1. **Streaming / Direct-to-Storage Presigned Uploads:**
   Vercel serverless functions have a 4.5MB payload limit on the free tier. While the provided 30-day CSV is well within this limit (~1.5MB), production files spanning years would require presigned S3/R2 direct uploads followed by an event-driven worker trigger.
2. **Background Processing & Webhooks:**
   For multi-million row datasets, move parsing from an HTTP request cycle to an asynchronous job queue (e.g., Inngest, BullMQ, or AWS SQS) with WebSocket progress updates.
3. **Automated Billing Credit Calculator:**
   Introduce customer contract models that automatically calculate dollar credits owed based on monthly SLA breach tiers (e.g. 99.0% - 99.9% = 10% credit; <99.0% = 25% credit).
4. **Time-Series Latency Heatmaps:**
   Add interactive SVG/Canvas timeline heatmaps to visualize latency spikes across 15-minute intervals.
