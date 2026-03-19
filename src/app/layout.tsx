import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";

export const metadata: Metadata = {
  title: "ClawBoard - OpenClaw Admin Dashboard",
  description: "Admin dashboard for managing and monitoring an OpenClaw AI agent framework instance",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased min-h-screen bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          storageKey="clawboard-theme"
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
