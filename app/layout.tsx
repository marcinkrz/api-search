import "./globals.css";
import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "API Search",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl" suppressHydrationWarning>
      <body className="min-h-screen">
        <ThemeProvider>
          <main className="container">
            {children}
          </main>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
