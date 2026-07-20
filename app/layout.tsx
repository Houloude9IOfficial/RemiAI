import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { AppSidebar } from "@/components/sidebar/AppSidebar";
import { ThemeFavicon } from "@/components/ThemeFavicon";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RemiAI",
  description: "Your local AI assistant for your own files.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any", type: "image/x-icon" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-48x48.png", sizes: "48x48", type: "image/png" },
    ],
    apple: [
      { url: "/RemiAI.png", sizes: "180x180" },
      { url: "/RemiAI-Light.png", sizes: "180x180" },
    ],
  },
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      {/*
        Inline theme initialisation — runs synchronously before any paint.
        This prevents the "flash of wrong theme" by applying the correct
        'light'/'dark' class to <html> before the browser renders anything.
        Must mirror the logic in ThemeProvider.tsx.
      */}
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var t=localStorage.getItem("theme");
                var r="light";
                if(t==="dark"||t==="light"){r=t}
                else{r=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}
                document.documentElement.classList.add(r);
                document.documentElement.style.colorScheme=r;
              } catch(e){}
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <Providers>
          <ThemeFavicon />
          <div className="flex h-screen w-full">
            <AppSidebar />
            <main className="flex flex-1 flex-col overflow-auto">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
