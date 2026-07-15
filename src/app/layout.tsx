import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IVE — YouTube comments, on air",
  description:
    "Replay a YouTube channel's comments as a broadcast-style rundown or live chat.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full">
        <div id="app-root" className="flex min-h-dvh flex-col">
          {children}
        </div>
      </body>
    </html>
  );
}
