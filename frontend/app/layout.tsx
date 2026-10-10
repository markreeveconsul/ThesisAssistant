import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ThesisAssistant — research, grounded in your sources",
  description: "A private, local-first workspace for source-grounded thesis research.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
