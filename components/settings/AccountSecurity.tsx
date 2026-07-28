"use client";

import { useState } from "react";
import { KeyRound, LogOut, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/components/auth/AuthProvider";

export function AccountSecurity() {
  const { account, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pending, setPending] = useState(false);

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault(); setPending(true);
    try {
      const response = await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Password change failed.");
      setCurrentPassword(""); setNewPassword(""); toast.success("Password changed. Please sign in again."); await logout();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Password change failed."); }
    finally { setPending(false); }
  };

  return <Card>
    <CardHeader><CardTitle className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="h-4 w-4 text-primary" />Account security</CardTitle><CardDescription>{account?.email} · Your local RemiAI account protects the app and its APIs.</CardDescription></CardHeader>
    <CardContent className="space-y-5">
      <form onSubmit={changePassword} className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium"><KeyRound className="h-4 w-4" />Change password</div>
        <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="current-password">Current password</Label><Input id="current-password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required /></div><div className="space-y-1.5"><Label htmlFor="new-password">New password</Label><Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} required /></div></div>
        <Button type="submit" variant="outline" disabled={pending}>{pending && <Loader2 className="animate-spin" />} Update password</Button>
      </form>
      <div className="border-t pt-4"><Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void logout()}><LogOut /> Sign out</Button></div>
    </CardContent>
  </Card>;
}
