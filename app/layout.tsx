import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Product Line",
  description: "Use your portfolio. Find your product line.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
