"use client";

interface HeatmapDay {
  date: string;
  uploadBytes: number;
  downloadBytes: number;
}

function formatBytes(value: number): string {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

export function BandwidthHeatmap({ days }: { days: HeatmapDay[] }) {
  const max = Math.max(...days.map((day) => day.uploadBytes + day.downloadBytes), 1);
  return (
    <div className="mt-5 border-t border-obsidian-800 pt-4">
      <div className="mb-2 flex items-center justify-between text-[11px] text-slate-500">
        <span>Usage intensity</span>
        <span>Low <span className="mx-1 inline-flex gap-0.5 align-middle">{[0.12, 0.3, 0.52, 0.75, 1].map((opacity) => <i key={opacity} className="h-2.5 w-2.5 rounded-sm bg-cyan-400" style={{ opacity }} />)}</span> High</span>
      </div>
      <div className="grid grid-cols-7 gap-1.5 sm:grid-cols-14">
        {days.map((day) => {
          const total = day.uploadBytes + day.downloadBytes;
          const intensity = total ? 0.12 + (total / max) * 0.88 : 0.06;
          return <div key={day.date} title={`${day.date}: ${formatBytes(total)} total (${formatBytes(day.downloadBytes)} down, ${formatBytes(day.uploadBytes)} up)`} className="h-7 rounded-md bg-cyan-400 transition-transform hover:scale-110" style={{ opacity: intensity }} />;
        })}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-slate-600"><span>{days[0]?.date ?? ""}</span><span>{days[days.length - 1]?.date ?? ""}</span></div>
    </div>
  );
}
