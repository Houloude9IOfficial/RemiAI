import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { AppSidebar } from "@/components/sidebar/AppSidebar";
import { ThemeFavicon } from "@/components/ThemeFavicon";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { MobileSidebar } from "@/components/sidebar/MobileSidebar";
import { SidebarProvider } from "@/components/sidebar/SidebarContext";
import { ShortcutsProvider } from "@/components/sidebar/ShortcutsProvider";
import { GlobalMobileHeader } from "@/components/GlobalMobileHeader";

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
  appleWebApp: {
    capable: true,
    title: "RemiAI",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any", type: "image/x-icon" },
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-48x48.png", sizes: "48x48", type: "image/png" },
    ],
    apple: [
      { url: "/icon-192x192.png", sizes: "192x192" },
      { url: "/RemiAI.png", sizes: "180x180" },
      { url: "/RemiAI-Light.png", sizes: "180x180" },
    ],
  },
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#17181c" },
  ],
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
                // Re-apply a previously chosen accent color (cached by
                // AccentColorProvider) so it shows before first paint.
                var accent=localStorage.getItem("remi-accent-"+r);
                if(accent){
                  var vars=JSON.parse(accent);
                  for(var k in vars){document.documentElement.style.setProperty(k, vars[k]);}
                }
                // Re-apply a previously chosen background palette (cached by
                // BackgroundColorProvider) so it shows before first paint.
                var bg=localStorage.getItem("remi-background-"+r);
                if(bg){
                  var bvars=JSON.parse(bg);
                  for(var bk in bvars){document.documentElement.style.setProperty(bk, bvars[bk]);}
                }
              } catch(e){}
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <Providers>
          <ThemeFavicon />
          <ServiceWorkerRegistration />
          <SidebarProvider>
            <ShortcutsProvider>
              <div className="flex h-screen w-full supports-[height:100dvh]:h-dvh">
                {/* Floating-card app shell: sidebar + main panel sit as one
                    rounded card on a subtle gradient canvas with breathing
                    room around it. Collapses to full-bleed on narrow
                    viewports (no padding, square corners, no shadow). */}
                <div className="relative min-w-0 flex-1 p-0 md:p-3 lg:p-4">
                  <div
                    aria-hidden="true"
                    className="shell-canvas pointer-events-none absolute inset-0"
                  />
                  <div className="relative flex h-full w-full overflow-hidden rounded-none bg-background md:rounded-2xl md:border md:border-border/70 md:shadow-floating">
                    <AppSidebar />
                    <MobileSidebar />
                    <main className="flex min-w-0 flex-1 flex-col overflow-y-auto overflow-x-clip">
                      <GlobalMobileHeader />
                      {children}
                    </main>
                  </div>
                </div>
              </div>
            </ShortcutsProvider>
          </SidebarProvider>
        </Providers>
      </body>
    </html>
  );
}
