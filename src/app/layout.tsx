import type { Metadata } from "next";
import Image from "next/image";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cortex Ops",
  description: "Internal operations dashboard for Cortex client workspaces.",
  icons: {
    icon: "/cortex-icon.svg",
    shortcut: "/cortex-icon.svg",
    apple: "/cortex-icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${spaceGrotesk.variable} bg-cortex-base font-body text-cortex-text-primary antialiased`}
      >
        <div className="min-h-screen">
          <header className="sticky top-0 z-40 border-b border-cortex-border/80 bg-black/82 backdrop-blur-xl">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
              <div>
                <div>
                  <Image
                    src="/cortex-logo-primary.svg"
                    alt="Cortex"
                    width={240}
                    height={48}
                    className="h-auto w-[172px] md:w-[208px]"
                    priority
                  />
                  <p className="mt-1 text-[11px] uppercase tracking-[0.22em] text-cortex-text-muted">
                    Your brand, engineered.
                  </p>
                </div>
              </div>

              <div className="hidden rounded-full border border-cortex-border bg-cortex-surface/80 px-4 py-2 md:block">
                <p className="text-[11px] uppercase tracking-[0.24em] text-cortex-text-secondary">
                  Autonomous pipeline control
                </p>
              </div>
            </div>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
