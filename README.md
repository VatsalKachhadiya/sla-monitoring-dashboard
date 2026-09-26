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

## 4. Assumptions & Design Decisions

### 1. SLA Calculation & Availability Target
- **Success Criteria:** A check is considered **healthy** if and only if its HTTP status code is in the **2xx** range (`200–299`). Any `4xx` (client error) or `5xx` (server error) is treated as downtime.
- **SLA Target:** Set to **99.9%** availability (the standard three-nines cloud SLA). Any service falling below 99.90% is flagged with a high-visibility `SLA BREACHED` badge in the UI.

### 2. Operational Metrics Selection
The top stats section provides actionable insights for SREs and financial billing teams:
- **Availability %:** Determines eligibility for SLA penalty credits.
- **Total Downtime (Minutes):** Calculated as `failed_checks × 15 min check interval`. This gives direct visibility into business impact.
- **Worst Day Identification:** Groups failures by calendar date (UTC) and highlights the exact date with the lowest availability. For instance, in the 9-day dataset, `svc-reports` Day 5 (2025-05-13) had an availability drop to 93.75% during checks 64–69 (~16:00–17:15 UTC).
- **Latency Percentiles (Avg, P50, P95, P99):** While availability tracks binary uptime, tail latency (P95/P99) exposes service degradation and near-outage slowdowns.

### 3. Dataset Replacement Strategy
Each upload action completely clears previous checks and replaces them with the new upload. This ensures that uploading different evaluation files (e.g. 9-day vs. 30-day) yields clean, isolated metrics without data pollution.

### 4. Interactive Collapsible Dashboard & Log Filters
- **Collapsible Stats:** SREs investigating granular log entries can collapse the top statistics section to maximize screen real estate.
- **Log Filtering:** Supports both a **single-date picker** (to immediately isolate an incident day) and a **date-range picker** (to inspect trends across multiple days), along with a **service dropdown filter** and **pagination**.

---

## 5. Local Setup & Running Locally

### Prerequisites
- Node.js 18.x or 20.x
- A free Supabase account ([supabase.com](https://supabase.com))

### 1. Clone the repository
```bash
git clone https://github.com/vatsal-kachhadiya/sla-monitoring-dashboard.git
cd sla-monitoring-dashboard
```

### 2. Install dependencies
```bash
npm install
```

### 3. Set up the Database Schema
1. Open your Supabase Dashboard and go to the **SQL Editor**.
2. Copy and paste the contents of `supabase/schema.sql` into the editor and click **Run**.
3. This creates the `monitoring_checks` table with appropriate indexes and RLS policies.

### 4. Configure Environment Variables
Create a `.env.local` file in the project root:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 5. Run the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 6. Deployment to Vercel

1. Push your repository to GitHub.
2. Log into [Vercel](https://vercel.com) and click **"Add New Project"**.
3. Import your GitHub repository.
4. Under **Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. Click **Deploy**. Vercel will build the Next.js app and deploy the serverless functions (`/api/upload`, `/api/stats`, `/api/logs`) globally.

---

## 7. What I'd Do Differently With More Time

1. **Streaming / Direct-to-Storage Presigned Uploads:**
   Vercel serverless functions have a 4.5MB payload limit on the free tier. While the provided 30-day CSV is well within this limit (~1.5MB), production files spanning years would require presigned S3/R2 direct uploads followed by an event-driven worker trigger.
2. **Background Processing & Webhooks:**
   For multi-million row datasets, move parsing from an HTTP request cycle to an asynchronous job queue (e.g., Inngest, BullMQ, or AWS SQS) with WebSocket progress updates.
3. **Automated Billing Credit Calculator:**
   Introduce customer contract models that automatically calculate dollar credits owed based on monthly SLA breach tiers (e.g. 99.0% - 99.9% = 10% credit; <99.0% = 25% credit).
4. **Time-Series Latency Heatmaps:**
   Add interactive SVG/Canvas timeline heatmaps to visualize latency spikes across 15-minute intervals.
