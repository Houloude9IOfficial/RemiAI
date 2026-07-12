"use client";

import { useQuery } from "@tanstack/react-query";
import CenteredLayout from "@/components/layout/CenteredLayout";
import { TokenUsageByChat } from "@/components/settings/TokenUsageByChat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type ChatTokenUsage = {
  id: number;
  title: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  updatedAt: string;
};

type TokenUsageStats = {
  chatUsage: ChatTokenUsage[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  last24hTokens: number;
  last7dTokens: number;
  last30dTokens: number;
};

async function fetchUsageStats(): Promise<TokenUsageStats> {
  const res = await fetch("/api/usage");
  if (!res.ok) throw new Error("Failed to fetch usage stats");
  return res.json();
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(2) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "K";
  }
  return num.toString();
}

export default function UsagePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["usage-stats"],
    queryFn: fetchUsageStats,
  });

  if (isLoading) {
    return (
      <CenteredLayout>
        <div className="flex max-w-4xl flex-col gap-6 w-full">
          <div>
            <h1 className="text-lg font-semibold">Token Usage</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Token consumption statistics. Data is approximate.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-8 w-32" />
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      </CenteredLayout>
    );
  }

  if (error) {
    return (
      <CenteredLayout>
        <div className="flex max-w-4xl flex-col gap-6 w-full">
          <div>
            <h1 className="text-lg font-semibold">Token Usage</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Token consumption statistics. Data is approximate.
            </p>
          </div>
          <Card>
            <CardContent className="pt-6">
              <p className="text-destructive">Error loading usage data: {error.message}</p>
            </CardContent>
          </Card>
        </div>
      </CenteredLayout>
    );
  }

  if (!data) {
    return (
      <CenteredLayout>
        <div className="flex max-w-4xl flex-col gap-6 w-full">
          <div>
            <h1 className="text-lg font-semibold">Token Usage</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Token consumption statistics. Data is approximate.
            </p>
          </div>
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground">No usage data available.</p>
            </CardContent>
          </Card>
        </div>
      </CenteredLayout>
    );
  }

  return (
    <CenteredLayout>
      <div className="flex max-w-4xl flex-col gap-6 w-full">
        <div>
          <h1 className="text-lg font-semibold">Token Usage</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Token consumption statistics. Data is approximate.
          </p>
        </div>

        {/* Time Period Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Last 24 Hours</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(data.last24hTokens)}</div>
              <p className="text-xs text-muted-foreground">
                Total tokens
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Last 7 Days</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(data.last7dTokens)}</div>
              <p className="text-xs text-muted-foreground">
                Total tokens
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Last 30 Days</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(data.last30dTokens)}</div>
              <p className="text-xs text-muted-foreground">
                Total tokens
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">All Time</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(data.totalTokens)}</div>
              <p className="text-xs text-muted-foreground">
                Total tokens
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Input/Output Split */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Input Tokens</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(data.totalInputTokens)}</div>
              <p className="text-xs text-muted-foreground">
                All time
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Output Tokens</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(data.totalOutputTokens)}</div>
              <p className="text-xs text-muted-foreground">
                All time
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Top Chats by Token Usage */}
        <TokenUsageByChat chatUsage={data.chatUsage} />
      </div>
    </CenteredLayout>
  );
}
