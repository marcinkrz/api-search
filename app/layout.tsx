import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "API Search",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl">
      <body className="min-h-screen">
        {children}
      </body>
    </html>
  );
}
