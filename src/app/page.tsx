"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
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
        setError("Please select a CSV file.");
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
        setError(data.error || "Upload failed. Please try again.");
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
          : "Network error. Please check your connection and try again."
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>📊 SLA Monitor</h1>
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
            Upload a CSV file containing health-check logs. The data will be
            validated, cleaned, and stored for SLA analysis.
          </p>

          {/* Drop zone */}
          {!file && (
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
                CSV files only
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

          {/* Selected file */}
          {file && !result?.success && (
            <div className="file-selected">
              <span className="file-icon">📄</span>
              <span className="file-name">{file.name}</span>
              <span className="file-size">
                {(file.size / 1024).toFixed(1)} KB
              </span>
              <button
                className="file-remove"
                onClick={() => {
                  setFile(null);
                  setResult(null);
                  setError(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                aria-label="Remove file"
              >
                ✕
              </button>
            </div>
          )}

          {/* Upload button */}
          {file && !result?.success && (
            <button
              className="upload-btn"
              onClick={handleUpload}
              disabled={uploading}
            >
              {uploading ? "Processing..." : "Upload & Process"}
            </button>
          )}

          {/* Progress indicator */}
          {uploading && (
            <div className="upload-progress">
              <div className="progress-bar-track">
                <div
                  className="progress-bar-fill indeterminate"
                  style={{ width: "30%" }}
                />
              </div>
              <div className="upload-status">
                Uploading and processing CSV data...
              </div>
            </div>
          )}

          {/* Error message */}
          {error && !result && (
            <div className="processing-result">
              <div className="result-header error">⚠ Processing Error</div>
              <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
                {error}
              </p>
            </div>
          )}

          {/* Success result */}
          {result?.success && (
            <div className="processing-result">
              <div className="result-header success">
                ✓ CSV Processed Successfully
              </div>

              <div className="result-stats">
                <div className="result-stat">
                  <div className="label">Total Rows</div>
                  <div className="value">{result.total_rows_parsed.toLocaleString()}</div>
                </div>
                <div className="result-stat">
                  <div className="label">Valid Records</div>
                  <div className="value" style={{ color: "var(--success)" }}>
                    {result.valid_records_inserted.toLocaleString()}
                  </div>
                </div>
                <div className="result-stat">
                  <div className="label">Duplicates Removed</div>
                  <div className="value" style={{ color: "var(--warning)" }}>
                    {result.duplicates_removed}
                  </div>
                </div>
                <div className="result-stat">
                  <div className="label">Invalid Skipped</div>
                  <div className="value" style={{ color: "var(--danger)" }}>
                    {result.invalid_records_skipped}
                  </div>
                </div>
              </div>

              <div className="result-stats">
                <div className="result-stat">
                  <div className="label">Services</div>
                  <div className="value">{result.services_found.length}</div>
                </div>
                <div className="result-stat">
                  <div className="label">Date Range</div>
                  <div className="value" style={{ fontSize: "12px" }}>
                    {result.date_range
                      ? `${result.date_range.start.substring(0, 10)} → ${result.date_range.end.substring(0, 10)}`
                      : "N/A"}
                  </div>
                </div>
              </div>

              {result.data_quality_issues.length > 0 && (
                <div className="data-issues">
                  <h4>
                    Data Quality Issues Found ({result.data_quality_issues.length})
                  </h4>
                  {result.data_quality_issues.map((issue, i) => (
                    <div className="issue-item" key={i}>
                      <div className="issue-type">
                        {issue.type.replace(/_/g, " ")} ({issue.count})
                      </div>
                      <div className="issue-desc">{issue.description}</div>
                      <div className="issue-action">→ {issue.action}</div>
                    </div>
                  ))}
                </div>
              )}

              <Link href="/dashboard" className="view-dashboard-btn">
                View Dashboard →
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
