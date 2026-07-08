"use client";

import { useState } from "react";
import type { DailyCount } from "@/lib/stats";

// Chart palette, validated for the dark glass surface (CVD-safe, ≥3:1 contrast):
const REMEMBERED = "#0fa396"; // teal
const MISSED = "#7d8ad6"; // slate violet
const ACCURACY = "#8b7cf8"; // violet

interface Tip {
  x: number;
  y: number;
  lines: string[];
}

function Tooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-white/15 bg-night-800/95 px-3 py-1.5 text-xs shadow-xl"
      style={{ left: `${tip.x}%`, top: `${tip.y}%` }}
    >
      {tip.lines.map((line, i) => (
        <p key={i} className={i === 0 ? "font-semibold" : "text-ink-muted"}>{line}</p>
      ))}
    </div>
  );
}

/** Stacked daily bar chart: remembered vs missed reviews, last 14 days. */
export function DailyReviewsChart({ data }: { data: DailyCount[] }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const W = 560;
  const H = 180;
  const PAD = { top: 10, bottom: 22, left: 26, right: 4 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const max = Math.max(4, ...data.map((d) => d.total));
  const step = plotW / data.length;
  const barW = Math.min(18, step * 0.55);

  const yTicks = [0, Math.round(max / 2), max];

  return (
    <div className="relative">
      <div className="mb-3 flex items-center gap-4 text-xs text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: REMEMBERED }} /> Remembered
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: MISSED }} /> Missed
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Reviews per day for the last 14 days">
        {yTicks.map((t) => {
          const y = PAD.top + plotH - (t / max) * plotH;
          return (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="rgba(255,255,255,0.07)" />
              <text x={PAD.left - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#9aa3c7">{t}</text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const x = PAD.left + i * step + (step - barW) / 2;
          const hCorrect = (d.correct / max) * plotH;
          const hMissed = ((d.total - d.correct) / max) * plotH;
          const yMissedTop = PAD.top + plotH - hCorrect - (hMissed > 0 ? hMissed + 2 : 0);
          const cx = ((x + barW / 2) / W) * 100;
          return (
            <g
              key={i}
              onMouseEnter={() =>
                setTip({
                  x: cx,
                  y: ((yMissedTop - 6) / H) * 100,
                  lines: [d.date, `${d.total} reviews`, `${d.correct} remembered · ${d.total - d.correct} missed`],
                })
              }
              onMouseLeave={() => setTip(null)}
            >
              {/* invisible hit target wider than the bar */}
              <rect x={PAD.left + i * step} y={PAD.top} width={step} height={plotH} fill="transparent" />
              {d.correct > 0 && (
                <rect
                  x={x}
                  y={PAD.top + plotH - hCorrect}
                  width={barW}
                  height={hCorrect}
                  fill={REMEMBERED}
                  rx={hMissed > 0 ? 0 : 3}
                />
              )}
              {d.total - d.correct > 0 && (
                <rect x={x} y={yMissedTop} width={barW} height={hMissed} fill={MISSED} rx={3} />
              )}
              {i % 2 === 0 && (
                <text x={x + barW / 2} y={H - 8} textAnchor="middle" fontSize="9" fill="#9aa3c7">
                  {d.date.split(" ")[1]}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <Tooltip tip={tip} />
      {/* Accessible table equivalent */}
      <table className="sr-only">
        <caption>Reviews per day, last 14 days</caption>
        <thead><tr><th>Day</th><th>Total</th><th>Remembered</th></tr></thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}><td>{d.date}</td><td>{d.total}</td><td>{d.correct}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Accuracy line chart over the last six weeks. */
export function AccuracyLineChart({ data }: { data: { label: string; accuracy: number; total: number }[] }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const W = 560;
  const H = 180;
  const PAD = { top: 14, bottom: 24, left: 32, right: 40 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const pts = data.map((d, i) => ({
    ...d,
    x: PAD.left + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW),
    y: PAD.top + plotH - (d.accuracy / 100) * plotH,
  }));
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const last = pts[pts.length - 1];

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Review accuracy per week, last 6 weeks">
        {[0, 50, 100].map((t) => {
          const y = PAD.top + plotH - (t / 100) * plotH;
          return (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="rgba(255,255,255,0.07)" />
              <text x={PAD.left - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#9aa3c7">{t}%</text>
            </g>
          );
        })}
        <path d={path} fill="none" stroke={ACCURACY} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <g
            key={i}
            onMouseEnter={() =>
              setTip({
                x: (p.x / W) * 100,
                y: ((p.y - 8) / H) * 100,
                lines: [p.label, p.total > 0 ? `${p.accuracy}% accuracy` : "no reviews", `${p.total} reviews`],
              })
            }
            onMouseLeave={() => setTip(null)}
          >
            <circle cx={p.x} cy={p.y} r={14} fill="transparent" />
            <circle cx={p.x} cy={p.y} r={4} fill={ACCURACY} stroke="#12162a" strokeWidth="2" />
            <text x={p.x} y={H - 8} textAnchor="middle" fontSize="9" fill="#9aa3c7">{p.label.replace(" ago", "")}</text>
          </g>
        ))}
        {/* direct label on the latest point */}
        <text x={last.x + 8} y={last.y + 3} fontSize="11" fontWeight="600" fill="#c9bfff">{last.accuracy}%</text>
      </svg>
      <Tooltip tip={tip} />
      <table className="sr-only">
        <caption>Accuracy per week</caption>
        <thead><tr><th>Week</th><th>Accuracy</th><th>Reviews</th></tr></thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}><td>{d.label}</td><td>{d.accuracy}%</td><td>{d.total}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
