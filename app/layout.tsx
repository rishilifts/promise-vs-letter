import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Promise vs Letter - check the offer letter against what was promised",
  description:
    "The recruiter promised one thing in chat. The offer letter says another. Paste both - detected differences are shown with the lines the model extracted from each side, checked against their source.",
  openGraph: {
    title: "Promise vs Letter",
    description:
      "The recruiter promised one thing in chat. The offer letter says another. Paste both - detected differences are shown with the lines the model extracted from each side.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
