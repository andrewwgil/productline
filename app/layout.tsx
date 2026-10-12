import type { Metadata, Viewport } from "next";
import { Newsreader } from "next/font/google";
import { SwRegister } from "@/components/sw-register";
import "./globals.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  display: "swap",
  style: ["normal", "italic"],
  weight: ["400", "500", "600"],
  variable: "--font-newsreader",
});

export const metadata: Metadata = {
  title: "Product Line",
  description: "Use your portfolio. Find your product line.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "Share to Arcade", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-180.png" },
};

export const viewport: Viewport = {
  themeColor: "#fdfcfb",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={newsreader.variable}>
      <body className="antialiased">
        <SwRegister />
        {children}
      </body>
    </html>
  );
}
