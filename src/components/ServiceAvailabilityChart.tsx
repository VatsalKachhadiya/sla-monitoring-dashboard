"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import type { ServiceStats } from "@/types";

interface Props {
  services: ServiceStats[];
  slaTarget?: number;
  isFiltered?: boolean;
  filterDescription?: string | null;
}

export default function ServiceAvailabilityChart({
  services,
  slaTarget = 99.9,
  isFiltered = false,
  filterDescription = null,
}: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    // Dispose previous instance if existing
    if (chartInstanceRef.current) {
      chartInstanceRef.current.dispose();
      chartInstanceRef.current = null;
    }

    if (services.length === 0) return;

    const chart = echarts.init(chartRef.current, undefined, {
      renderer: "canvas",
    });
    chartInstanceRef.current = chart;

    // Sort services ascending so lowest is displayed with high visibility
    const sorted = [...services].sort(
      (a, b) => a.availability_pct - b.availability_pct
    );

    const serviceNames = sorted.map((s) => s.service_name || s.service_id);
    const availabilities = sorted.map((s) => s.availability_pct);

    // Compute dynamic min for x-axis so differences near the SLA target stand out clearly
    const minVal = Math.min(...availabilities);
    const dynamicMin = Math.max(
      0,
      Math.floor(minVal >= 90 ? minVal - 1 : minVal >= 70 ? minVal - 5 : minVal - 10)
    );

    const option: echarts.EChartsOption = {
      backgroundColor: "transparent",
      title: {
        text: "Service Availability vs SLA Target (99.900%)",
        subtext: isFiltered && filterDescription
          ? `Filtered: ${filterDescription}`
          : "Contractual three-nines benchmark comparison",
        left: 0,
        top: 0,
        textStyle: {
          color: "#f1f5f9",
          fontSize: 14,
          fontWeight: 600,
          fontFamily: "'Inter', sans-serif",
        },
        subtextStyle: {
          color: "#94a3b8",
          fontSize: 11,
          fontFamily: "'Inter', sans-serif",
        },
      },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: "#1a2035",
        borderColor: "rgba(99, 102, 241, 0.3)",
        borderWidth: 1,
        padding: [10, 14],
        textStyle: {
          color: "#f1f5f9",
          fontSize: 12,
          fontFamily: "'Inter', sans-serif",
        },
        formatter: (params: unknown) => {
          const item = Array.isArray(params) ? params[0] : (params as echarts.DefaultLabelFormatterCallbackParams);
          const dataIndex = item.dataIndex as number;
          const svc = sorted[dataIndex];
          if (!svc) return "";
          const diff = svc.availability_pct - slaTarget;
          const statusText = svc.sla_met
            ? `<span style="color: #10b981; font-weight: 700;">✓ SLA Met (+${diff.toFixed(3)}%)</span>`
            : `<span style="color: #ef4444; font-weight: 700;">⚠ SLA Breached (${diff.toFixed(3)}%)</span>`;

          return `
            <div style="font-weight: 600; font-size: 13px; margin-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px;">
              ${svc.service_name} <span style="font-size: 11px; color: #94a3b8; font-weight: normal;">(${svc.service_id})</span>
            </div>
            <div style="margin-bottom: 3px;">Availability: <strong style="color: ${svc.sla_met ? "#10b981" : "#ef4444"}; font-size: 14px;">${svc.availability_pct.toFixed(3)}%</strong></div>
            <div style="margin-bottom: 3px;">SLA Status: ${statusText}</div>
            <div style="color: #94a3b8; font-size: 11px; margin-top: 4px;">
              Total Checks: ${svc.total_checks.toLocaleString()} • Failed: <span style="color: ${svc.failed_checks > 0 ? "#ef4444" : "#94a3b8"}">${svc.failed_checks}</span>
            </div>
          `;
        },
      },
      grid: {
        left: 10,
        right: 48,
        top: 60,
        bottom: 10,
        containLabel: true,
      },
      xAxis: {
        type: "value",
        min: dynamicMin,
        max: 100,
        axisLabel: {
          formatter: "{value}%",
          color: "#94a3b8",
          fontSize: 11,
          fontFamily: "'Inter', sans-serif",
        },
        splitLine: {
          lineStyle: {
            color: "rgba(255, 255, 255, 0.06)",
            type: "dashed",
          },
        },
        axisLine: {
          lineStyle: { color: "rgba(255, 255, 255, 0.1)" },
        },
      },
      yAxis: {
        type: "category",
        data: serviceNames,
        axisLabel: {
          color: "#f1f5f9",
          fontSize: 12,
          fontWeight: 500,
          fontFamily: "'Inter', sans-serif",
        },
        axisTick: { show: false },
        axisLine: {
          lineStyle: { color: "rgba(255, 255, 255, 0.15)" },
        },
      },
      series: [
        {
          name: "Availability",
          type: "bar",
          data: availabilities,
          barWidth: 20,
          itemStyle: {
            borderRadius: [0, 6, 6, 0],
            color: (params) => {
              const val = typeof params.value === "number" ? params.value : 0;
              return val >= slaTarget
                ? new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                    { offset: 0, color: "#059669" },
                    { offset: 1, color: "#10b981" },
                  ])
                : new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                    { offset: 0, color: "#b91c1c" },
                    { offset: 1, color: "#ef4444" },
                  ]);
            },
          },
          label: {
            show: true,
            position: "right",
            formatter: (p) => {
              const val = typeof p.value === "number" ? p.value : 0;
              return `${val.toFixed(3)}%`;
            },
            color: "#f1f5f9",
            fontSize: 11,
            fontWeight: 600,
            fontFamily: "'SF Mono', monospace",
          },
          markLine: {
            silent: false,
            symbol: ["none", "none"],
            lineStyle: {
              color: "#f59e0b",
              type: "dashed",
              width: 2,
            },
            label: {
              show: true,
              position: "end",
              formatter: `Target: ${slaTarget.toFixed(3)}%`,
              color: "#f59e0b",
              fontSize: 11,
              fontWeight: 700,
              backgroundColor: "rgba(245, 158, 11, 0.12)",
              borderColor: "rgba(245, 158, 11, 0.3)",
              borderWidth: 1,
              borderRadius: 4,
              padding: [3, 8],
            },
            data: [{ xAxis: slaTarget }],
          },
        },
      ],
    };

    chart.setOption(option);

    // Responsive resize listener
    const resizeObserver = new ResizeObserver(() => {
      chart.resize();
    });
    resizeObserver.observe(chartRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.dispose();
      chartInstanceRef.current = null;
    };
  }, [services, slaTarget, isFiltered, filterDescription]);

  if (services.length === 0) {
    return (
      <div className="chart-empty-state">
        <p>No service availability data available for the active filter.</p>
      </div>
    );
  }

  return (
    <div className="chart-wrapper">
      <div
        ref={chartRef}
        style={{
          width: "100%",
          height: `${Math.max(220, services.length * 44 + 80)}px`,
        }}
      />
    </div>
  );
}
