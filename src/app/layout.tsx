import type { Metadata } from "next";
import { Cinzel, Cormorant_Garamond } from "next/font/google";
import { AppProviders } from "@/components/providers/app-providers";
import { FeedbackDock } from "@/components/feedback-dock";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Agent Senate",
  description:
    "Research exploration platform for tradeoff-oriented LLM studies across conditions, roles, and topics.",
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
      className={`${cinzel.variable} ${cormorant.variable} h-full antialiased`}
    >
      <body suppressHydrationWarning className="min-h-full">
        <AppProviders>
          <div className="marble-surface min-h-svh">
            <SiteHeader />
            <main className="mx-auto w-full max-w-[1200px] px-4 pb-5 pt-24 md:px-6 md:pt-26">{children}</main>
            <SiteFooter />
            <FeedbackDock />
          </div>
        </AppProviders>
      </body>
    </html>
  );
}
