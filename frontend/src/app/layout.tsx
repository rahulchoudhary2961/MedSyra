import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import GlobalInputSuggestions from "./components/GlobalInputSuggestions";
import { getSiteUrl } from "@/lib/runtime-url";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: "MedSyra",
    template: "%s | MedSyra"
  },
  description: "Healthcare ERP and CRM software for clinics, doctors, and hospitals.",
  applicationName: "MedSyra",
  keywords: [
    "healthcare ERP",
    "clinic management software",
    "hospital CRM",
    "medical records",
    "appointments",
    "billing"
  ],
  openGraph: {
    title: "MedSyra",
    description: "Healthcare ERP and CRM software for clinics, doctors, and hospitals.",
    type: "website",
    images: [
      {
        url: "/Logo.jpeg",
        width: 512,
        height: 512,
        alt: "MedSyra logo"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "MedSyra",
    description: "Healthcare ERP and CRM software for clinics, doctors, and hospitals.",
    images: ["/Logo.jpeg"]
  },
  icons: {
    icon: "/Logo.jpeg",
    shortcut: "/Logo.jpeg",
    apple: "/Logo.jpeg"
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <GlobalInputSuggestions />
        {children}
      </body>
    </html>
  );
}
