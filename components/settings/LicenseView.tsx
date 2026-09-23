"use client";

import { useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Globe,
  Mail,
  ScrollText,
  ShieldCheck,
  Users,
} from "lucide-react";
import { SiGithub } from "react-icons/si";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AppInfo } from "@/lib/app-info";

const GITHUB_URL = "https://github.com/Houloude9IOfficial/RemiAI";
const CREATOR_WEBSITE_URL = "https://crickdevs.com";

interface LicenseViewProps {
  licenseText: string;
  appInfo: AppInfo;
}

export default function LicenseView({ licenseText, appInfo }: LicenseViewProps) {
  const [copied, setCopied] = useState(false);

  const copyLicense = async () => {
    try {
      await navigator.clipboard.writeText(licenseText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be unavailable (permissions, insecure context) — fail quietly.
    }
  };

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">License</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Legal information about {appInfo.name}, its license, copyright and
          how to reach the team behind it.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <ShieldCheck className="h-4 w-4 text-primary" />
            About
          </CardTitle>
          <CardDescription className="text-xs">
            {appInfo.description}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 border-t pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">MIT License</Badge>
            <Badge variant="outline">v{appInfo.version}</Badge>
          </div>
          <div className="grid gap-2 text-sm">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-muted-foreground">Created &amp; maintained by</span>
              <span className="font-medium text-primary underline-offset-4 cursor-pointer hover:text-primary" onClick={() => window.open(CREATOR_WEBSITE_URL, "_blank")}>
                {appInfo.author}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
              <a
                href={`mailto:${appInfo.contactEmail}`}
                className="text-primary underline-offset-4 hover:underline"
              >
                {appInfo.contactEmail}
              </a>
            </div>
            <div className="flex items-center gap-2">
              <SiGithub className="h-4 w-4 shrink-0 text-muted-foreground" />
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
              >
                GitHub repository
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
              <a
                href={appInfo.website}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
              >
                {appInfo.website.replace(/^https?:\/\//, "")}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <ScrollText className="h-4 w-4 text-primary" />
            MIT License
          </CardTitle>
          <CardDescription className="text-xs">
            Read directly from the LICENSE file shipped with this installation.
          </CardDescription>
          <CardAction>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={copyLicense}
              disabled={!licenseText}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? "Copied" : "Copy"}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="border-t pt-4">
          {licenseText ? (
            <pre className="max-h-96 overflow-auto rounded-lg bg-muted/50 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-muted-foreground">
              {licenseText}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">
              LICENSE file could not be read from this installation.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
