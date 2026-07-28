"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { AlertCircle, LockKeyhole, Loader2 } from "lucide-react";

type Mode = "login" | "signup";
type FormErrors = Partial<Record<"email" | "password" | "displayName" | "code", string>>;

const emptyErrors: FormErrors = {};

export function AuthWall({ children }: { children: React.ReactNode }) {
  const { loading, configured, account, refresh } = useAuth();
  const [mode, setMode] = useState<Mode>(configured ? "login" : "signup");
  const [form, setForm] = useState({ email: "", password: "", displayName: "", code: "", remember: true });
  const [errors, setErrors] = useState<FormErrors>(emptyErrors);
  const [submitError, setSubmitError] = useState("");
  const [pending, setPending] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!configured) setMode("signup");
  }, [configured]);

  useEffect(() => {
    if (!loading && !account) {
      const timer = window.setTimeout(() => emailRef.current?.focus(), 120);
      return () => window.clearTimeout(timer);
    }
  }, [loading, account, mode]);

  if (loading) return <div className="flex h-screen items-center justify-center bg-background"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (account) return <>{children}</>;

  const updateMode = (nextMode: Mode) => {
    setMode(nextMode);
    setErrors(emptyErrors);
    setSubmitError("");
  };

  const validate = (): FormErrors => {
    const next: FormErrors = {};
    if (!form.email.trim()) next.email = "Enter your email address.";
    else if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) next.email = "Enter a valid email address.";
    if (!form.password) next.password = "Enter your password.";
    else if (mode === "signup" && (form.password.length < 8 || form.password.length > 256)) next.password = "Use between 8 and 256 characters.";
    if (mode === "signup") {
      if (!form.displayName.trim()) next.displayName = "Enter your name.";
      if (!form.code.trim()) next.code = "Enter the signup code from the server console.";
    }
    return next;
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    setSubmitError("");
    if (Object.keys(nextErrors).length > 0) return;

    setPending(true);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, email: form.email.trim(), displayName: form.displayName.trim(), code: form.code.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "We couldn’t complete that. Please try again.");
      await refresh();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "We couldn’t complete that. Please try again.");
    } finally {
      setPending(false);
    }
  };

  const fieldError = (name: keyof FormErrors) => errors[name];

  return <main className="flex min-h-screen items-center justify-center bg-muted/20 px-4 py-8">
    <div className="w-full max-w-sm rounded-2xl border bg-background p-7 shadow-sm transition-shadow duration-300">
      <div className="mb-6 text-center">
        <img src="/RemiAI.png" alt="RemiAI" className="mx-auto mb-5 h-9 w-auto dark:hidden" />
        <img src="/RemiAI-Light.png" alt="RemiAI" className="mx-auto mb-5 hidden h-9 w-auto dark:block" />
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary"><LockKeyhole className="h-5 w-5" /></div>
        <h1 className="text-lg font-semibold">{mode === "login" ? "Sign in" : "Create your account"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{mode === "login" ? "Continue to your private RemiAI workspace." : "One account keeps your RemiAI workspace private."}</p>
      </div>

      <div role="tablist" aria-label="Authentication" className="mb-6 grid grid-cols-2 rounded-lg bg-muted p-1">
        {(["login", "signup"] as const).map((tab) => <button key={tab} type="button" role="tab" aria-selected={mode === tab} onClick={() => updateMode(tab)} className={cn("rounded-md px-3 py-1.5 text-sm transition-all", mode === tab ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{tab === "login" ? "Sign in" : "Create account"}</button>)}
      </div>

      <form key={mode} onSubmit={submit} noValidate className="space-y-4" aria-busy={pending}>
        {mode === "signup" && <div className="space-y-1.5"><Label htmlFor="displayName">Name</Label><Input id="displayName" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} autoComplete="name" autoFocus={!form.email} aria-invalid={Boolean(fieldError("displayName"))} aria-describedby={fieldError("displayName") ? "displayName-error" : undefined} />{fieldError("displayName") && <FieldError id="displayName-error">{fieldError("displayName")}</FieldError>}</div>}
        <div className="space-y-1.5"><Label htmlFor="email">Email</Label><Input ref={emailRef} id="email" type="email" value={form.email} onChange={(e) => { setForm({ ...form, email: e.target.value }); setErrors({ ...errors, email: undefined }); }} autoComplete="email" aria-invalid={Boolean(fieldError("email"))} aria-describedby={fieldError("email") ? "email-error" : undefined} />{fieldError("email") && <FieldError id="email-error">{fieldError("email")}</FieldError>}</div>
        <div className="space-y-1.5"><Label htmlFor="password">Password</Label><Input id="password" type="password" value={form.password} onChange={(e) => { setForm({ ...form, password: e.target.value }); setErrors({ ...errors, password: undefined }); }} autoComplete={mode === "login" ? "current-password" : "new-password"} aria-invalid={Boolean(fieldError("password"))} aria-describedby={fieldError("password") ? "password-error" : "password-hint"} />{fieldError("password") ? <FieldError id="password-error">{fieldError("password")}</FieldError> : <p id="password-hint" className="text-xs text-muted-foreground">{mode === "signup" ? "At least 8 characters." : "Enter the password for this workspace."}</p>}</div>
        {mode === "signup" && <div className="space-y-1.5"><Label htmlFor="code">Signup code</Label><Input id="code" value={form.code} onChange={(e) => { setForm({ ...form, code: e.target.value.toUpperCase() }); setErrors({ ...errors, code: undefined }); }} autoComplete="one-time-code" spellCheck={false} className="font-mono tracking-[0.12em]" aria-invalid={Boolean(fieldError("code"))} aria-describedby={fieldError("code") ? "code-error" : "code-hint"} />{fieldError("code") ? <FieldError id="code-error">{fieldError("code")}</FieldError> : <p id="code-hint" className="text-xs text-muted-foreground">Printed in the server console on first run.</p>}</div>}
        {mode === "login" && <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={form.remember} onChange={(e) => setForm({ ...form, remember: e.target.checked })} className="accent-primary" /> Remember me for 30 days</label>}
        <div aria-live="polite" className={cn("overflow-hidden transition-all duration-200 ease-out", submitError ? "max-h-20 pt-1 opacity-100" : "max-h-0 opacity-0")}>
          {submitError && <div role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{submitError}</span></div>}
        </div>
        <Button type="submit" className="h-9 w-full" disabled={pending}>{pending ? <><Loader2 className="animate-spin" /> {mode === "login" ? "Signing in…" : "Creating account…"}</> : mode === "login" ? "Sign in" : "Create account"}</Button>
      </form>
      {configured && mode === "login" && <p className="mt-5 letter-spacing: var(--tracking-widest); text-center text-xs text-muted-foreground">Need to reset your password? Run <code className="rounded bg-muted px-1 py-0.5">npm run auth:reset</code> in the server terminal.</p>}
    </div>
  </main>;
}

function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return <p id={id} role="alert" className="text-xs text-destructive">{children}</p>;
}
