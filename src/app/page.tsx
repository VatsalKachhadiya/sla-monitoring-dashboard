"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import type { ProcessingResult } from "@/types";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    (selectedFile: File | null) => {
      setError(null);
      setResult(null);
      if (selectedFile && !selectedFile.name.endsWith(".csv")) {
        setError("Invalid file type. Please select a .csv file.");
        return;
      }
      setFile(selectedFile);
    },
    []
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) handleFileSelect(droppedFile);
    },
    [handleFileSelect]
  );

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error || "Upload processing failed. Please check the file and try again.");
        if (data.data_quality_issues) {
          setResult(data);
        }
      } else {
        setResult(data as ProcessingResult);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Network or server connection error. Please try again."
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <Logo href="/dashboard" />
        <nav>
          <Link href="/" className="nav-link active">
            Upload
          </Link>
          <Link href="/dashboard" className="nav-link">
            Dashboard
          </Link>
        </nav>
      </header>

      <main className="main-content upload-page">
        <div className="upload-card">
          <h2>Upload Monitoring Data</h2>
          <p>
            Upload a CSV file containing multi-agent health check logs. Data will be
            validated, cleaned, normalized, and persisted to Supabase PostgreSQL for SLA analysis.
          </p>

          {/* Drop zone */}
          {!file && !result?.success && (
            <div
              className={`dropzone ${dragOver ? "drag-over" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="dropzone-icon">📁</div>
              <div className="dropzone-text">
                <strong>Click to browse</strong> or drag & drop
                <br />
                Supports standard CSV files (.csv)
              </div>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            style={{ display: "none" }}
            onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
          />

          {/* Selected file card */}
          {file && !result?.success && (
            <div className="file-selected">
              <span className="file-icon">📄</span>
              <div className="file-meta">
                <span className="file-name">{file.name}</span>
                <span className="file-size">
                  {(file.size / 1024).toFixed(1)} KB
                </span>
              </div>
              <button
                className="file-remove"
                onClick={handleReset}
                aria-label="Remove selected file"
                title="Remove file"
              >
                ✕
              </button>
            </div>
          )}

          {/* Upload CTA */}
          {file && !result?.success && (
            <button
              className="upload-btn"
              onClick={handleUpload}
              disabled={uploading}
            >
              {uploading ? "Ingesting & Validating..." : "Upload & Process CSV"}
            </button>
          )}

          {/* Progress state */}
          {uploading && (
            <div className="upload-progress">
              <div className="progress-bar-track">
                <div
                  className="progress-bar-fill indeterminate"
                  style={{ width: "30%" }}
                />
              </div>
              <div className="upload-status">
                Normalizing timestamps, reconciling latency units, and writing to database...
              </div>
            </div>
          )}

          {/* Error feedback */}
          {error && (
            <div className="processing-result error-banner">
              <div className="result-header error">⚠ Ingestion Error</div>
              <p className="error-message-text">{error}</p>
              <button className="retry-btn" onClick={handleReset} style={{ marginTop: "12px" }}>
                Select Another File
              </button>
            </div>
          )}

          {/* Success Summary feedback */}
          {result?.success && (
            <div className="processing-result">
              <div className="result-header success">
                ✓ CSV Ingested & Verified Successfully
              </div>

              {/* Requirement 7: Explicit rows breakdown */}
              <div className="result-stats result-stats-5">
                <div className="result-stat">
                  <div className="label">Total Rows Received</div>
                  <div className="value">{result.total_rows_parsed.toLocaleString()}</div>
                  <div className="stat-sub">Parsed from CSV</div>
                </div>
                <div className="result-stat">
                  <div className="label">Valid Rows</div>
                  <div className="value" style={{ color: "var(--success)" }}>
                    {result.valid_records_inserted.toLocaleString()}
                  </div>
                  <div className="stat-sub">Passed validation</div>
                </div>
                <div className="result-stat">
                  <div className="label">Rows Persisted</div>
                  <div className="value" style={{ color: "var(--accent-primary)" }}>
                    {result.valid_records_inserted.toLocaleString()}
                  </div>
                  <div className="stat-sub">Written to PostgreSQL</div>
                </div>
                <div className="result-stat">
                  <div className="label">Duplicates Handled</div>
                  <div className="value" style={{ color: "var(--warning)" }}>
                    {result.duplicates_removed.toLocaleString()}
                  </div>
                  <div className="stat-sub">De-duplicated</div>
                </div>
                <div className="result-stat">
                  <div className="label">Invalid / Rejected</div>
                  <div className="value" style={{ color: result.invalid_records_skipped > 0 ? "var(--danger)" : "var(--text-muted)" }}>
                    {result.invalid_records_skipped.toLocaleString()}
                  </div>
                  <div className="stat-sub">{result.invalid_records_skipped > 0 ? "Skipped (logged)" : "0 rejected"}</div>
                </div>
              </div>

              <div className="result-meta-row">
                <div className="result-meta-pill">
                  <span className="meta-label">Services Detected:</span>{" "}
                  <strong>{result.services_found.length}</strong> ({result.services_found.join(", ")})
                </div>
                <div className="result-meta-pill">
                  <span className="meta-label">Date Window (UTC):</span>{" "}
                  <strong>
                    {result.date_range
                      ? `${result.date_range.start.substring(0, 10)} → ${result.date_range.end.substring(0, 10)}`
                      : "N/A"}
                  </strong>
                </div>
              </div>

              {/* Data quality issues audit breakdown */}
              {result.data_quality_issues.length > 0 && (
                <div className="data-issues">
                  <h4>
                    Data Quality Remediation Audit ({result.data_quality_issues.length} issue types detected)
                  </h4>
                  {result.data_quality_issues.map((issue, i) => (
                    <div className="issue-item" key={i}>
                      <div className="issue-type">
                        {issue.type.replace(/_/g, " ")} ({issue.count.toLocaleString()})
                      </div>
                      <div className="issue-desc">{issue.description}</div>
                      <div className="issue-action">Action: {issue.action}</div>
                    </div>
                  ))}
                </div>
              )}

              <div className="upload-actions-row">
                <Link href="/dashboard" className="view-dashboard-btn">
                  View SLA Dashboard →
                </Link>
                <button className="upload-another-btn" onClick={handleReset}>
                  Upload Another File
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
