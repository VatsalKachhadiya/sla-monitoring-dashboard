import React from "react";
import Link from "next/link";

interface LogoIconProps {
  size?: number;
  className?: string;
}

export function LogoIcon({ size = 28, className = "" }: LogoIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        {/* Layered dark monochrome background gradient */}
        <linearGradient id="sla-mark-bg" x1="16" y1="0" x2="16" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1e2433" />
          <stop offset="100%" stopColor="#0b0f17" />
        </linearGradient>

        {/* Subtle graphite border highlight */}
        <linearGradient id="sla-mark-border" x1="16" y1="0" x2="16" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3d475c" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#1a202c" stopOpacity="0.5" />
        </linearGradient>

        {/* Upward pulse check gradient */}
        <linearGradient id="sla-mark-stroke" x1="6" y1="21" x2="25" y2="8" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#e2e8f0" />
          <stop offset="100%" stopColor="#ffffff" />
        </linearGradient>
      </defs>

      {/* Outer rounded container tile */}
      <rect
        x="0.75"
        y="0.75"
        width="30.5"
        height="30.5"
        rx="7.5"
        fill="url(#sla-mark-bg)"
        stroke="url(#sla-mark-border)"
        strokeWidth="1.2"
      />

      {/* Inner hairline highlight */}
      <rect
        x="1.75"
        y="1.75"
        width="28.5"
        height="28.5"
        rx="6.5"
        fill="none"
        stroke="rgba(255, 255, 255, 0.05)"
        strokeWidth="1"
      />

      {/* Telemetry background metric bars (subtle graphite tones) */}
      <rect x="7" y="17" width="2" height="5" rx="1" fill="#334155" opacity="0.55" />
      <rect x="11" y="14" width="2" height="8" rx="1" fill="#475569" opacity="0.5" />
      <rect x="15" y="11" width="2" height="11" rx="1" fill="#64748b" opacity="0.45" />

      {/* Upward Heartbeat Pulse + SLA Confirmation Checkmark */}
      <path
        d="M 6.5 16.5 L 9.5 16.5 L 12 12.5 L 15 21 L 24 9"
        stroke="url(#sla-mark-stroke)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Active telemetry signal beacon (emerald status pip) */}
      <circle cx="24" cy="9" r="1.5" fill="#10b981" />
      <circle cx="24" cy="9" r="3.2" fill="#10b981" fillOpacity="0.22" />
    </svg>
  );
}

interface LogoProps {
  size?: number;
  href?: string;
  showText?: boolean;
  className?: string;
}

export function Logo({ size = 28, href = "/dashboard", showText = true, className = "" }: LogoProps) {
  const content = (
    <span className={`brand-logo ${className}`}>
      <span className="brand-logo-icon">
        <LogoIcon size={size} />
      </span>
      {showText && (
        <span className="brand-logo-text">
          <span className="brand-logo-name">SLA</span>
          <span className="brand-logo-suffix">Monitor</span>
        </span>
      )}
    </span>
  );

  if (href) {
    return (
      <Link href={href} className="brand-logo-link" aria-label="SLA Monitor Dashboard">
        {content}
      </Link>
    );
  }

  return content;
}
