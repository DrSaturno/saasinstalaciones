import type { Metadata, Viewport } from "next";
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
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Instala Pro",
  },
};

export const viewport: Viewport = {
  themeColor: "#2597d0",
  width: "device-width",
  initialScale: 1,
  // El área installer se usa en la calle: evitar zoom accidental al tocar inputs.
  maximumScale: 1,
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
