"use client";
import { useSearchParams } from "next/navigation";

/** Keep list context in the URL without a server round-trip on every keystroke. */
export function useFinanceQuery() {
  const params = useSearchParams();
  function update(values: Record<string, string | null>) {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(values)) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }
  return { params, update };
}
