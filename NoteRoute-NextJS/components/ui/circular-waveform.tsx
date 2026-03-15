"use client";

import React from "react";

interface CircularWaveformProps {
  /** Values in [0, 1] — one per bar */
  samples: number[];
  barCount?: number;
  barWidth?: number;
  barColor?: string;
  waveAmplitude?: number;
  radius?: number;
  size?: number;
  barMinHeight?: number;
  strokeLinecap?: "butt" | "round" | "square";
  growOutwardsOnly?: boolean;
}

export function CircularWaveform({
  samples,
  barCount = 60,
  barWidth = 3,
  barColor = "currentColor",
  waveAmplitude = 40,
  radius = 80,
  size = 220,
  barMinHeight = 3,
  strokeLinecap = "round",
  growOutwardsOnly = true,
}: CircularWaveformProps) {
  const center = size / 2;

  const bars = Array.from({ length: barCount }, (_, i) => {
    const sample = samples[i % samples.length] ?? 0;
    const angleRad = (i / barCount) * 2 * Math.PI - Math.PI / 2;
    const dynamicHeight = Math.max(barMinHeight, sample * waveAmplitude);

    let startRadius: number;
    let endRadius: number;

    if (growOutwardsOnly) {
      startRadius = radius;
      endRadius = radius + dynamicHeight;
    } else {
      startRadius = radius - dynamicHeight / 2;
      endRadius = radius + dynamicHeight / 2;
    }

    if (startRadius < 0) {
      endRadius += Math.abs(startRadius);
      startRadius = 0;
    }

    const maxAllowed = center - barWidth;
    if (endRadius > maxAllowed) endRadius = maxAllowed;
    if (startRadius > endRadius) startRadius = Math.max(0, endRadius - barMinHeight);

    return {
      x1: center + startRadius * Math.cos(angleRad),
      y1: center + startRadius * Math.sin(angleRad),
      x2: center + endRadius * Math.cos(angleRad),
      y2: center + endRadius * Math.sin(angleRad),
    };
  });

  return (
    <svg width={size} height={size} style={{ overflow: "visible" }}>
      {bars.map((bar, i) => (
        <line
          key={i}
          x1={bar.x1}
          y1={bar.y1}
          x2={bar.x2}
          y2={bar.y2}
          stroke={barColor}
          strokeWidth={barWidth}
          strokeLinecap={strokeLinecap}
          style={{ transition: "all 0.05s ease-out" }}
        />
      ))}
    </svg>
  );
}
