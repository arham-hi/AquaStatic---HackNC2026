import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 active:scale-[0.98] select-none",
  {
    variants: {
      variant: {
        primary: "bg-carolina text-white shadow-[0_6px_16px_-8px_rgba(75,156,211,0.9)] hover:brightness-110",
        secondary: "bg-bg-elev text-fg border border-border hover:border-border-strong hover:bg-carolina-soft/40 shadow-sm",
        ghost: "text-fg-muted hover:text-fg hover:bg-fg/5",
        glass: "glass text-fg hover:bg-carolina-soft/40",
        danger: "bg-red text-white hover:brightness-110",
        mint: "bg-mint text-white shadow-[0_6px_16px_-8px_rgba(47,191,143,0.9)] hover:brightness-110",
        link: "text-carolina underline-offset-4 hover:underline px-0 h-auto",
      },
      size: {
        sm: "h-8 px-3 text-xs [&_svg]:size-3.5",
        md: "h-10 px-4 [&_svg]:size-4",
        lg: "h-12 px-6 text-base [&_svg]:size-5",
        icon: "size-10 [&_svg]:size-4",
        "icon-sm": "size-8 [&_svg]:size-4",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, loading, children, disabled, ...props }, ref) => {
  if (asChild) {
    // Slot needs exactly one child: pass the child through untouched.
    return <Slot className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>{children}</Slot>;
  }
  return (
    <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} disabled={disabled || loading} {...props}>
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
});
Button.displayName = "Button";
export { buttonVariants };
