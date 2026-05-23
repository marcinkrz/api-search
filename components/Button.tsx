"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/utils/styles-merge";

const buttonVariants = cva(
  `cursor-pointer inline-flex justify-center items-center leading-none tracking-wide whitespace-nowrap border border-transparent rounded-xl transition-colors disabled:cursor-default`,
  {
    variants: {
      size: {
        default:
          "text-base px-6 py-2",
        small:
          "text-sm !leading-none px-4 py-2 rounded-lg",
        icon:
          "min-w-[2rem] p-1 rounded-lg",
      },
      variant: {
        primary:
          `bg-[var(--foreground)] text-[var(--background)] 
          hover:bg-[var(--foreground-1)] 
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--foreground)]
          active:bg-[var(--foreground-1)]
          disabled:bg-[var(--background-3)] disabled:border-[var(--background-3)] disabled:hover:border-[var(--background-3)]`,
        outline:
          `bg-transparent border-[var(--border)] text-[var(--foreground-1)] 
          hover:border-[var(--foreground)] hover:text-[var(--foreground)]
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--foreground)]  focus-visible:border-transparent
          active:border-[var(--foreground)] active:text-[var(--foreground)]
          disabled:text-[var(--border)] disabled:border-[var(--border-light)] disabled:hover:border-[var(--border-light)]`,
        ghost:
          `bg-transparent text-[var(--foreground)] 
          hover:bg-[var(--background-3)] 
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--background-3)]
          active:bg-[var(--background-3)]
          disabled:text-[var(--border)] disabled:hover:bg-transparent`,
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, size, variant, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ size, variant, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
