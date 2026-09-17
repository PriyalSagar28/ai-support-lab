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
    "A learning project exploring AI-powered email categorization, sentiment analysis, response generation, and evaluation.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <NavBar />
        <main className="container">{children}</main>
        <footer className="footer">
          <div className="container">
            AI Support Lab — an independent personal learning project.
          </div>
        </footer>
      </body>
    </html>
  );
}
