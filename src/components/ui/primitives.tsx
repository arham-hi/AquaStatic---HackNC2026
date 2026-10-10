"use client";
// Small shadcn-style primitives on Radix. One file keeps imports short for a hackathon codebase.

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------- Inputs ----------
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn("flex h-10 w-full rounded-xl border border-border bg-bg-elev px-3.5 text-sm placeholder:text-fg-faint focus-visible:border-carolina focus-visible:ring-4 focus-visible:ring-carolina/20 focus-visible:outline-none transition-shadow", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn("flex min-h-[88px] w-full rounded-xl border border-border bg-bg-elev px-3.5 py-2.5 text-sm placeholder:text-fg-faint focus-visible:border-carolina focus-visible:ring-4 focus-visible:ring-carolina/20 focus-visible:outline-none transition-shadow resize-none", className)} {...props} />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn("flex h-10 w-full rounded-xl border border-border bg-bg-elev px-3 text-sm focus-visible:border-carolina focus-visible:ring-4 focus-visible:ring-carolina/20 focus-visible:outline-none", className)} {...props}>
    {children}
  </select>
));
Select.displayName = "Select";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-xs font-semibold uppercase tracking-wide text-fg-muted", className)} {...props} />;
}

// ---------- Badge / Card / Skeleton / Empty ----------
export function Badge({ className, tone = "neutral", ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "carolina" | "mint" | "amber" | "red" | "violet" }) {
  const tones = {
    neutral: "bg-fg/6 text-fg-muted", carolina: "bg-carolina-soft text-carolina", mint: "bg-mint-soft text-mint", amber: "bg-amber-soft text-amber", red: "bg-red-soft text-red", violet: "bg-violet/15 text-violet",
  } as const;
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4 whitespace-nowrap", tones[tone], className)} {...props} />;
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("card p-4", className)} {...props} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4 w-full", className)} aria-hidden />;
}

export function EmptyState({ icon: Icon, title, body, action, className }: { icon?: React.ComponentType<{ className?: string }>; title: string; body?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center rounded-2xl border border-dashed border-border-strong px-6 py-10 gap-2", className)}>
      {Icon ? <div className="size-11 rounded-2xl bg-carolina-soft text-carolina grid place-items-center mb-1"><Icon className="size-5" /></div> : null}
      <div className="font-semibold">{title}</div>
      {body ? <p className="text-sm text-fg-muted max-w-sm text-balance">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

// ---------- Dialog ----------
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export function DialogContent({ className, children, title, description, hideClose, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { title: string; description?: string; hideClose?: boolean }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-[90] bg-[rgba(5,12,28,0.45)] backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out" />
      <DialogPrimitive.Content
        className={cn("fixed z-[100] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-24px)] max-w-lg max-h-[calc(100dvh-24px)] overflow-y-auto scrollbar-thin rounded-2xl glass-strong p-5 sm:p-6 animate-rise focus:outline-none", className)}
        {...props}
      >
        <DialogPrimitive.Title className="text-lg font-semibold tracking-tight">{title}</DialogPrimitive.Title>
        <DialogPrimitive.Description className={cn("text-sm text-fg-muted mt-0.5", !description && "sr-only")}>{description ?? title}</DialogPrimitive.Description>
        <div className="mt-4">{children}</div>
        {!hideClose && (
          <DialogPrimitive.Close className="absolute right-3 top-3 rounded-lg p-1.5 text-fg-muted hover:bg-fg/5 hover:text-fg" aria-label="Close">
            <X className="size-4" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

// ---------- Tabs ----------
export const Tabs = TabsPrimitive.Root;
export function TabsList({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("inline-flex items-center gap-1 rounded-xl bg-fg/5 p-1", className)} {...props} />;
}
export function TabsTrigger({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return <TabsPrimitive.Trigger className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-fg-muted transition-all data-[state=active]:bg-bg-elev data-[state=active]:text-fg data-[state=active]:shadow-sm hover:text-fg whitespace-nowrap", className)} {...props} />;
}
export const TabsContent = TabsPrimitive.Content;

// ---------- Chip (filter pill) ----------
export function Chip({ active, className, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button type="button" aria-pressed={active} className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 h-8 text-xs font-medium transition-colors whitespace-nowrap", active ? "bg-carolina text-white border-carolina shadow-sm" : "bg-bg-elev/70 border-border text-fg-muted hover:text-fg hover:border-border-strong", className)} {...props}>
      {children}
    </button>
  );
}

// ---------- Switch ----------
export function Switch({ className, ...props }: React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root className={cn("peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors data-[state=checked]:bg-carolina data-[state=unchecked]:bg-fg/15 disabled:opacity-50", className)} {...props}>
      <SwitchPrimitive.Thumb className="pointer-events-none block size-5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0" />
    </SwitchPrimitive.Root>
  );
}

// ---------- Tooltip ----------
export const TooltipProvider = TooltipPrimitive.Provider;
export function Tip({ label, children, side = "right" }: { label: string; children: React.ReactNode; side?: "top" | "right" | "bottom" | "left" }) {
  return (
    <TooltipPrimitive.Root delayDuration={300}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={8} className="z-[120] rounded-lg bg-fg px-2.5 py-1.5 text-xs font-medium text-bg shadow-lg animate-rise">
          {label}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

// ---------- Dropdown ----------
export const Dropdown = DropdownPrimitive.Root;
export const DropdownTrigger = DropdownPrimitive.Trigger;
export function DropdownContent({ className, ...props }: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content sideOffset={8} align="end" className={cn("z-[110] min-w-[220px] rounded-2xl glass-strong p-1.5 animate-rise", className)} {...props} />
    </DropdownPrimitive.Portal>
  );
}
export function DropdownItem({ className, ...props }: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Item>) {
  return <DropdownPrimitive.Item className={cn("flex cursor-pointer select-none items-center gap-2 rounded-xl px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-carolina-soft/60 data-[disabled]:opacity-50", className)} {...props} />;
}
export function DropdownLabel({ className, ...props }: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Label>) {
  return <DropdownPrimitive.Label className={cn("px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-faint", className)} {...props} />;
}
export const DropdownSeparator = (props: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Separator>) => <DropdownPrimitive.Separator className="my-1 h-px bg-border" {...props} />;

// ---------- Avatar ----------
export function Avatar({ emoji, name, size = 36, className }: { emoji?: string | null; name?: string | null; size?: number; className?: string }) {
  const label = emoji || (name ? name.trim()[0]?.toUpperCase() : "?");
  return (
    <div aria-hidden className={cn("grid place-items-center rounded-full bg-gradient-to-br from-carolina-soft to-[rgba(75,156,211,0.35)] text-carolina-deep font-semibold shrink-0", className)} style={{ width: size, height: size, fontSize: size * 0.5 }}>
      {label}
    </div>
  );
}
