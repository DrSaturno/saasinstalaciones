"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {/* Radix exige un provider ancestro para los tooltips; va en la raíz
          para que cualquier pantalla pueda usarlos sin montar el suyo. */}
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}
