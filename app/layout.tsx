import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Oddsville",
  description:
    "A living city built from prediction markets, zoned by TypeSafe's Jev model.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
