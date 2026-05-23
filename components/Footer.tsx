"use client";

import ThemeSwitch from "@/components/ThemeSwitch";

export default function Footer() {
  return (
    <footer className="container mx-auto py-4 text-[var(--muted)]">
      <div className="flex justify-between items-center">
        <span className="inline-flex text-xs">
          {(new Date().getFullYear())} Visual Label. Wszelkie prawa zastrzeżone.
        </span>
        <div className="ml-2 flex gap-2">
          <ThemeSwitch />
        </div>
      </div>
    </footer>
  );
}
