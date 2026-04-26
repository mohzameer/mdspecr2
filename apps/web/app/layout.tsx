import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://mdspec.dev"),
  title: {
    default: "mdspec — CI-first markdown spec publishing",
    template: "%s | mdspec",
  },
  description:
    "mdspec syncs markdown files from your CI pipeline directly to ClickUp, S3, Notion, and Confluence. Git-native markdown CMS for engineering teams.",
  keywords: [
    "markdown content management",
    "markdown CMS",
    "md management",
    "md sync",
    "markdown sync",
    "ClickUp markdown",
    "S3 markdown upload",
    "markdown to ClickUp",
    "markdown to S3",
    "markdown to Notion",
    "markdown to Confluence",
    "CI spec publishing",
    "GitHub Actions markdown",
    "docs as code",
    "markdown automation",
    "engineering documentation",
    "spec publishing",
    "mdspec",
  ],
  authors: [{ name: "mdspec" }],
  creator: "mdspec",
  openGraph: {
    type: "website",
    siteName: "mdspec",
    title: "mdspec — CI-first markdown spec publishing",
    description:
      "Sync markdown files from CI to ClickUp, S3, Notion, and Confluence. Drop a .mdspecmap, add one CI step, done.",
    url: "https://mdspec.dev",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "mdspec — CI-first markdown spec publishing",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "mdspec — CI-first markdown spec publishing",
    description:
      "Sync markdown files from CI to ClickUp, S3, Notion, and Confluence. Drop a .mdspecmap, add one CI step, done.",
    images: ["/og.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: "https://mdspec.dev",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
