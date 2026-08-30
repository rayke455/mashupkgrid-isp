"use client";

import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";

export function Card({
  children,
  className = "",
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-slate-200/80 bg-white p-6 shadow-subtle transition-all duration-200 dark:border-obsidian-800 dark:bg-obsidian-900 ${
        hover ? "hover:border-brand-500/50 hover:shadow-card dark:hover:border-brand-500/40" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function Button({
  className = "",
  variant = "primary",
  size = "default",
  disabled,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "outline" | "ghost";
  size?: "sm" | "default" | "lg" | "icon";
}) {
  const variants = {
    primary:
      "bg-gradient-to-b from-brand-600 to-brand-700 text-white shadow-sm hover:from-brand-500 hover:to-brand-600 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:from-brand-400 disabled:to-brand-400 disabled:opacity-60 disabled:pointer-events-none",
    secondary:
      "bg-slate-100/90 text-slate-800 hover:bg-slate-200/90 active:scale-[0.98] dark:bg-obsidian-800 dark:text-slate-100 dark:hover:bg-obsidian-700 border border-slate-200/60 dark:border-obsidian-700/60 disabled:opacity-50",
    danger:
      "bg-red-600 text-white shadow-sm hover:bg-red-700 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-red-500 disabled:bg-red-400 disabled:opacity-60",
    outline:
      "border border-slate-300 bg-transparent text-slate-700 hover:bg-slate-100 active:scale-[0.98] dark:border-obsidian-700 dark:text-slate-200 dark:hover:bg-obsidian-800 disabled:opacity-50",
    ghost:
      "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:scale-[0.98] dark:text-slate-400 dark:hover:bg-obsidian-800 dark:hover:text-slate-100 disabled:opacity-50",
  };

  const sizes = {
    sm: "px-3 py-1.5 text-sm",
    default: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
    icon: "h-10 w-10 p-2.5 aspect-square",
  };

  return (
    <button
      disabled={disabled}
      className={`${variants[variant]} ${sizes[size]} inline-flex items-center justify-center rounded-lg font-medium transition-all duration-150 outline-none disabled:cursor-not-allowed ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

// react-hook-form's `register()` attaches a ref to every field to read its DOM value directly.
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = "", ...props }, ref) {
    return (
      <input
        ref={ref}
        className={`w-full rounded-lg border border-slate-300/90 bg-white px-3.5 py-2 text-sm text-slate-900 shadow-xs outline-none transition-all placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-obsidian-700 dark:bg-obsidian-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-brand-400 dark:focus:ring-brand-400/20 ${className}`}
        {...props}
      />
    );
  }
);

export function Label({
  children,
  htmlFor,
  className = "",
}: {
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={`mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 ${className}`}
    >
      {children}
    </label>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
      {children}
    </p>
  );
}

export function HintText({ children }: { children: ReactNode }) {
  return <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{children}</p>;
}

export function Badge({
  children,
  variant = "neutral",
  className = "",
}: {
  children: ReactNode;
  variant?: "success" | "warning" | "danger" | "info" | "neutral";
  className?: string;
}) {
  const styles = {
    success:
      "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
    warning:
      "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
    danger:
      "bg-rose-500/10 text-rose-700 border-rose-500/20 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    info:
      "bg-brand-500/10 text-brand-700 border-brand-500/20 dark:bg-brand-500/15 dark:text-brand-300 dark:border-brand-500/30",
    neutral:
      "bg-slate-100 text-slate-700 border-slate-200 dark:bg-obsidian-800 dark:text-slate-300 dark:border-obsidian-700",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide ${styles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

export function StatusDot({
  status,
  pulse = true,
}: {
  status: "ONLINE" | "WARNING" | "DOWN" | "ACTIVE" | "PAID" | "PENDING" | "UNKNOWN" | string;
  pulse?: boolean;
}) {
  const isGood = status === "ONLINE" || status === "ACTIVE" || status === "PAID";
  const isWarn = status === "WARNING" || status === "PENDING" || status === "PARTIALLY_PAID";
  const isBad = status === "DOWN" || status === "EXPIRED" || status === "OVERDUE" || status === "CANCELLED";

  const color = isGood
    ? "bg-emerald-500"
    : isWarn
    ? "bg-amber-500"
    : isBad
    ? "bg-rose-500"
    : "bg-slate-400";

  return (
    <span className="relative flex h-2 w-2 shrink-0">
      {pulse && isGood && (
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${color}`} />
      )}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${color}`} />
    </span>
  );
}

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  trend,
}: {
  title: string;
  value: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  trend?: { label: string; positive?: boolean };
}) {
  return (
    <Card className="relative overflow-hidden">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {title}
          </p>
          <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl font-mono">
            {value}
          </div>
          {subtitle && <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</div>}
          {trend && (
            <p
              className={`mt-2 text-xs font-medium ${
                trend.positive ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500"
              }`}
            >
              {trend.label}
            </p>
          )}
        </div>
        {icon && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-400 border border-brand-100 dark:border-brand-900/50">
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}

export function Unavailable({ feature }: { feature: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300/80 p-6 text-center text-sm text-slate-500 dark:border-obsidian-800 dark:text-slate-400">
      <p className="font-medium text-slate-700 dark:text-slate-300">{feature}</p>
      <p className="mt-1 text-xs text-slate-400">Planned for an upcoming release module.</p>
    </div>
  );
}
