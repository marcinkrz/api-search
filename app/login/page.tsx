"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(false);

    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.push("/");
    } else {
      setError(true);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center">
      <form onSubmit={handleLogin} className="bg-[var(--background)] p-6 rounded-2xl border border-[var(--border-light)] w-full max-w-sm">
        <h1 className="h3 mb-6">Zaloguj się</h1>
        <input
          name="password"
          type="password"
          placeholder="Hasło"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={`flex w-full outline-0 ring-0 ring-[var(--focus)] border border-[var(--border)] rounded-xl focus-visible:border-[var(--focus)] focus-visible:ring-1 active:border-[var(--focus)] active:ring-1 px-4 placeholder:text-[var(--muted)] ${error ? "border-[var(--danger-border)]" : ""}`}
        />
        {error && <p className="text-[var(--danger-text)] text-xs mt-1 pl-2">Nieprawidłowe hasło</p>}
        <button type="submit" className="cursor-pointer inline-flex justify-center items-center tracking-wide whitespace-nowrap border border-transparent rounded-xl transition-colors disabled:cursor-default text-base px-6 py-2 bg-[var(--foreground)] text-[var(--background)] hover:bg-[var(--foreground-1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--foreground)] active:bg-[var(--foreground-1)] disabled:bg-[var(--background-3)] disabled:border-[var(--background-3)] disabled:hover:border-[var(--background-3)] w-full mt-4">
          Zaloguj
        </button>
      </form>
    </div>
  );
}
