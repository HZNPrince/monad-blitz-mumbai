import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: {
    default: "Traction",
    template: "%s · Traction",
  },
  description:
    "An autonomous distribution agent that earns by learning what grows your product.",
  applicationName: "Traction",
  metadataBase: new URL("https://traction.build"),
  openGraph: {
    title: "Traction",
    description:
      "Autonomous product distribution, paid according to verified traction.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
