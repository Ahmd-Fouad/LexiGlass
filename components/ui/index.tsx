import Link from "next/link";
import React from "react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function GlassCard({
  children,
  className = "",
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div className={`glass rounded-2xl ${hover ? "glass-hover" : ""} ${className}`}>{children}</div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
};

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  const styles =
    variant === "primary"
      ? "btn-primary"
      : variant === "danger"
        ? "btn-ghost !border-rose-400/30 text-rose-300 hover:!bg-rose-400/10"
        : "btn-ghost";
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:pointer-events-none disabled:opacity-50 ${styles} ${className}`}
      {...props}
    />
  );
}

export function LinkButton({
  href,
  children,
  variant = "primary",
  className = "",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "ghost";
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold ${
        variant === "primary" ? "btn-primary" : "btn-ghost"
      } ${className}`}
    >
      {children}
    </Link>
  );
}

export function Field({
  label,
  required,
  children,
  hint,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-muted">
        {label}
        {required && <span className="text-rose-glow"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-muted/70">{hint}</span>}
    </label>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input(props, ref) {
    return <input ref={ref} className="field" {...props} />;
  }
);

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="field min-h-24" {...props} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className="field" {...props} />;
}

export function Chip({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "violet" | "teal" | "rose" | "amber" }) {
  const tones: Record<string, string> = {
    neutral: "border-white/15 bg-white/5 text-ink-muted",
    violet: "border-violet-glow/40 bg-violet-glow/15 text-violet-200",
    teal: "border-teal-glow/40 bg-teal-glow/10 text-teal-200",
    rose: "border-rose-glow/40 bg-rose-glow/10 text-rose-200",
    amber: "border-amber-400/40 bg-amber-400/10 text-amber-200",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function difficultyTone(d: string): "teal" | "amber" | "rose" {
  return d === "easy" ? "teal" : d === "hard" ? "rose" : "amber";
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-ink-muted" role="status">
      <span className="size-5 animate-spin rounded-full border-2 border-white/20 border-t-violet-glow" />
      {label}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-xl border border-rose-glow/40 bg-rose-glow/10 px-4 py-3 text-sm text-rose-200">
      {message}
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint: string;
  action?: ReactNode;
}) {
  return (
    <div className="glass rounded-2xl px-6 py-14 text-center">
      <p className="font-display text-2xl">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">{hint}</p>
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}
