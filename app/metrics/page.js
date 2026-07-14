"use client";

import { DataTable } from "../../components/data-table";
import { getDemoTrendRows } from "../../lib/carequeue-data";

export default function MetricsPage() {
  const rows = getDemoTrendRows();
  const latest = rows[rows.length - 1];
  const previous = rows[rows.length - 2];
  const averageCoverage = Math.round(rows.reduce((sum, row) => sum + row.highRiskCoverage, 0) / rows.length);
  const averageOverflow = Number((rows.reduce((sum, row) => sum + row.overflowCount, 0) / rows.length).toFixed(1));
  const averageAge = Number((rows.reduce((sum, row) => sum + row.averageCaseAge, 0) / rows.length).toFixed(1));

  const columns = [
    {
      accessorKey: "day",
      header: "Day"
    },
    {
      accessorKey: "highRiskCoverage",
      header: "High-risk coverage",
      cell: ({ row }) => `${row.original.highRiskCoverage}%`
    },
    {
      accessorKey: "publishRate",
      header: "Publish rate",
      cell: ({ row }) => `${row.original.publishRate}%`
    },
    {
      accessorKey: "overflowCount",
      header: "Overflow"
    },
    {
      accessorKey: "averageCaseAge",
      header: "Average case age",
      cell: ({ row }) => `${row.original.averageCaseAge}d`
    }
  ];

  return (
    <section className="page-shell">
      <header className="page-header">
        <div>
          <div className="workspace-eyebrow">Metrics / Trends</div>
          <h1 className="workspace-title">Coverage and aging trends</h1>
        </div>
      </header>

      <section className="history-summary-grid">
        <SummaryCard label="Latest high-risk coverage" value={`${latest.highRiskCoverage}%`} delta={formatDelta(latest.highRiskCoverage - previous.highRiskCoverage, "%")} />
        <SummaryCard label="Latest publish rate" value={`${latest.publishRate}%`} delta={formatDelta(latest.publishRate - previous.publishRate, "%")} />
        <SummaryCard label="Average overflow" value={averageOverflow} />
        <SummaryCard label="Average case age" value={`${averageAge}d`} />
      </section>

      <section className="metrics-grid">
        <div className="panel page-panel">
          <div className="panel-header">
            <div className="panel-label">Coverage rates</div>
            <h2>Daily coverage and publish trend</h2>
          </div>
          <div className="chart-legend">
            <LegendItem label="High-risk coverage" tone="blue" />
            <LegendItem label="Publish rate" tone="green" />
          </div>
          <LineTrendChart
            rows={rows}
            series={[
              { key: "highRiskCoverage", color: "var(--blue)" },
              { key: "publishRate", color: "var(--green)" }
            ]}
            minValue={70}
            maxValue={100}
            tickFormatter={(value) => `${Math.round(value)}%`}
          />
          <p className="chart-caption">High-risk coverage should trend up. Publish rate should stay consistently above it.</p>
        </div>

        <div className="panel page-panel">
          <div className="panel-header">
            <div className="panel-label">Overflow</div>
            <h2>Cases left unassigned after each run</h2>
          </div>
          <BarTrendChart
            rows={rows}
            valueKey="overflowCount"
            maxValue={Math.max(...rows.map((row) => row.overflowCount)) + 4}
            tickFormatter={(value) => String(Math.round(value))}
            barColor="var(--orange)"
          />
          <p className="chart-caption">Lower is better. Spikes here usually reflect either capacity gaps or eligibility gaps.</p>
        </div>

        <div className="panel page-panel">
          <div className="panel-header">
            <div className="panel-label">Aging</div>
            <h2>Average open-case age</h2>
          </div>
          <LineTrendChart
            rows={rows}
            series={[
              { key: "averageCaseAge", color: "var(--red)" }
            ]}
            minValue={2}
            maxValue={3.2}
            tickFormatter={(value) => `${value.toFixed(1)}d`}
          />
          <p className="chart-caption">Case age should move down as assignment coverage stabilizes.</p>
        </div>
      </section>

      <div className="panel page-panel">
        <div className="panel-header">
          <div className="panel-label">Daily detail</div>
          <h2>Exact values for recent trend data</h2>
        </div>
        <DataTable
          data={rows}
          columns={columns}
          getRowId={(row) => row.day}
          emptyMessage="No recent trend data."
        />
      </div>
    </section>
  );
}

function SummaryCard({ label, value, delta }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {delta ? <div className="chart-delta">{delta}</div> : null}
    </div>
  );
}

function LegendItem({ label, tone }) {
  return (
    <span className="legend-item">
      <span className={`legend-dot ${tone}`} />
      {label}
    </span>
  );
}

function LineTrendChart({ rows, series, minValue, maxValue, tickFormatter }) {
  const width = 640;
  const height = 240;
  const padding = { top: 20, right: 18, bottom: 36, left: 46 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const steps = rows.length > 1 ? rows.length - 1 : 1;
  const ticks = buildTicks(minValue, maxValue, 4);

  const getX = (index) => padding.left + (plotWidth / steps) * index;
  const getY = (value) => padding.top + ((maxValue - value) / (maxValue - minValue || 1)) * plotHeight;

  return (
    <div className="chart-shell">
      <svg viewBox={`0 0 ${width} ${height}`} className="trend-chart-svg" role="img" aria-label="Trend chart">
        {ticks.map((tick) => {
          const y = getY(tick);
          return (
            <g key={tick}>
              <line className="chart-grid-line" x1={padding.left} y1={y} x2={width - padding.right} y2={y} />
              <text className="chart-axis-label" x={padding.left - 10} y={y + 4} textAnchor="end">
                {tickFormatter(tick)}
              </text>
            </g>
          );
        })}

        {rows.map((row, index) => (
          <text key={row.day} className="chart-axis-label" x={getX(index)} y={height - 10} textAnchor="middle">
            {row.day}
          </text>
        ))}

        {series.map((seriesItem) => {
          const path = rows.map((row, index) => {
            const command = index === 0 ? "M" : "L";
            return `${command}${getX(index)} ${getY(row[seriesItem.key])}`;
          }).join(" ");

          return (
            <g key={seriesItem.key}>
              <path d={path} fill="none" stroke={seriesItem.color} strokeWidth="3" strokeLinecap="round" />
              {rows.map((row, index) => (
                <circle
                  key={`${seriesItem.key}-${row.day}`}
                  cx={getX(index)}
                  cy={getY(row[seriesItem.key])}
                  r="4"
                  fill={seriesItem.color}
                />
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function BarTrendChart({ rows, valueKey, maxValue, tickFormatter, barColor }) {
  const width = 640;
  const height = 240;
  const padding = { top: 20, right: 18, bottom: 36, left: 46 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const barWidth = Math.min(48, plotWidth / rows.length - 18);
  const ticks = buildTicks(0, maxValue, 4);

  const getBarX = (index) => padding.left + (plotWidth / rows.length) * index + ((plotWidth / rows.length) - barWidth) / 2;
  const getY = (value) => padding.top + ((maxValue - value) / (maxValue || 1)) * plotHeight;

  return (
    <div className="chart-shell">
      <svg viewBox={`0 0 ${width} ${height}`} className="trend-chart-svg" role="img" aria-label="Bar chart">
        {ticks.map((tick) => {
          const y = getY(tick);
          return (
            <g key={tick}>
              <line className="chart-grid-line" x1={padding.left} y1={y} x2={width - padding.right} y2={y} />
              <text className="chart-axis-label" x={padding.left - 10} y={y + 4} textAnchor="end">
                {tickFormatter(tick)}
              </text>
            </g>
          );
        })}

        {rows.map((row, index) => {
          const value = row[valueKey];
          const x = getBarX(index);
          const y = getY(value);
          const barHeight = height - padding.bottom - y;

          return (
            <g key={row.day}>
              <rect x={x} y={y} width={barWidth} height={barHeight} rx="8" fill={barColor} opacity="0.88" />
              <text className="chart-value-label" x={x + barWidth / 2} y={y - 8} textAnchor="middle">
                {value}
              </text>
              <text className="chart-axis-label" x={x + barWidth / 2} y={height - 10} textAnchor="middle">
                {row.day}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function buildTicks(minValue, maxValue, stepCount) {
  const ticks = [];
  const span = maxValue - minValue;
  const step = span / stepCount;

  for (let index = 0; index <= stepCount; index += 1) {
    ticks.push(minValue + step * index);
  }

  return ticks;
}

function formatDelta(value, suffix) {
  if (value === 0) return `Flat day over day`;
  return `${value > 0 ? "+" : ""}${value}${suffix} vs prior day`;
}
