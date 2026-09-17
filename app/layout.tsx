import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import NavBar from "@/components/NavBar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Support Lab",
  description:
    "An AI-powered workflow for customer-support email categorization, sentiment analysis, reply generation, and quality evaluation, using Google Gemini.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <NavBar />
        <main className="container">{children}</main>
        <footer className="footer">
          <div className="container">
            AI Support Lab — an independent project for AI-powered customer support email analysis.
          </div>
        </footer>
      </body>
    </html>
  );
}
