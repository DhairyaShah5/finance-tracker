import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://finances-mango.vercel.app"),
  title: "Finance Tracker",
  description: "Personal cash-flow, budget, and rewards tracker.",
  // Full-screen home-screen launch on iOS + the label under the icon.
  appleWebApp: { capable: true, title: "Finances", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  // Match the app background so the iOS status-bar strip blends into the header.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAFCFE" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0E18" },
  ],
  width: "device-width",
  initialScale: 1,
  // Enables env(safe-area-inset-*) so content clears the notch / home indicator.
  // maximumScale/userScalable left unset so pinch-zoom on tables still works.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <Providers>{children}</Providers>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
