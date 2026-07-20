import type { Metadata } from "next";
import { Inter, Fragment_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const fragmentMono = Fragment_Mono({
  variable: "--font-mono",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Instala Pro",
  description:
    "Gestión de equipos de instalación de gráfica de gran formato para proyectos masivos.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${inter.variable} ${fragmentMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
