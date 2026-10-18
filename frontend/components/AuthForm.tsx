"use client";
import { Otto } from "./Otto";
import Link from "next/link";
import { Brand } from "./Brand";
import { useActionState, useState } from "react";
import { ArrowRight } from "lucide-react";
import { authenticate, signInWithGoogle } from "@/app/auth/actions";

export function AuthForm({
  configured,
  recovery = false,
  linkError = false,
  oauthError = false,
}: {
  configured: boolean;
  recovery?: boolean;
  linkError?: boolean;
  oauthError?: boolean;
}) {
  const [mode, setMode] = useState(recovery ? "update" : "login");
  const [state, action, pending] = useActionState(authenticate, {});
  const [googleState, googleAction, googlePending] = useActionState(
    signInWithGoogle,
    {},
  );
  const title = {
    login: "Welcome back",
    signup: "Begin your next chapter.",
    reset: "Find your way back.",
    update: "Choose a new password.",
  }[mode];
  return (
    <main className="auth-page">
      <div className="auth-layout">
        <section className="auth-intro">
          <h1>Your thesis, backed by every source you read.</h1>
          <p>
            A thoughtful space to write, connect your sources, and develop your
            thesis—one paragraph at a time.
          </p>
          <div className="auth-manuscript">
            <Otto animate />
            <span className="eyebrow">ILLUSTRATIVE PREVIEW</span>
            <h3>From reading to understanding.</h3>
            <p>
              Bring your ideas and your reading together. Keep your research
              question close as you develop each paragraph.
            </p>
            <span className="sample-citation">
              Trace claims to their sources
            </span>
          </div>
        </section>
        <section className="auth-card">
          <Link href="/" className="wordmark">
            <Brand />
          </Link>
          <span className="eyebrow">THESA</span>
          <h2>{title}</h2>
          <p>
            {mode === "login"
              ? "Sign in to return to your writing."
              : mode === "signup"
                ? "Create your private research workspace."
                : "We’ll help you securely access your workspace."}
          </p>
          {!configured && (
            <p className="notice">
              Account setup is pending. You can write browser drafts without an
              account.
            </p>
          )}
          {linkError && (
            <p role="alert" className="error-text">
              Sign-in could not be completed. Please try again. If it keeps
              happening, check Supabase provider and callback settings.
            </p>
          )}
          {oauthError && (
            <p role="alert" className="error-text">
              Google did not complete sign-in. Check that Google is enabled,
              new user sign-ups are allowed, and your account is listed as a
              test user if the consent screen is in testing mode.
            </p>
          )}
          <form action={action} className="stack">
            <input type="hidden" name="mode" value={mode} />
            {mode !== "update" && (
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@university.edu"
                  disabled={!configured}
                />
              </label>
            )}
            {mode !== "reset" && (
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  required
                  minLength={mode === "login" ? 1 : 12}
                  maxLength={128}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  disabled={!configured}
                />
                {mode !== "login" && <small>At least 12 characters.</small>}
              </label>
            )}
            {state.error && (
              <p role="alert" className="error-text">
                {state.error}
              </p>
            )}
            {state.message && (
              <p role="status" className="notice">
                {state.message}
              </p>
            )}
            <button className="primary" disabled={!configured || pending}>
              {pending
                ? "Please wait…"
                : mode === "login"
                  ? "Sign in"
                  : mode === "signup"
                    ? "Create account"
                    : mode === "reset"
                      ? "Send recovery email"
                      : "Update password"}
              <ArrowRight size={16} />
            </button>
          </form>
          {mode === "login" && (
            <form action={googleAction}>
              {googleState.error && (
                <p role="alert" className="error-text">
                  {googleState.error}
                </p>
              )}
              <button
                className="secondary google-login"
                disabled={!configured || googlePending}
                type="submit"
              >
                {googlePending ? "Connecting…" : "Continue with Google"}
              </button>
            </form>
          )}
          {!recovery && (
            <div className="auth-links">
              <button
                className="text-button"
                onClick={() => setMode(mode === "signup" ? "login" : "signup")}
              >
                {mode === "signup"
                  ? "Already have an account? Sign in"
                  : "Create an account"}
              </button>
              <button
                className="text-button"
                onClick={() => setMode(mode === "reset" ? "login" : "reset")}
              >
                {mode === "reset" ? "Back to sign in" : "Forgot password?"}
              </button>
            </div>
          )}
          {!configured && (
            <Link className="preview-link" href="/">
              Open browser drafts <ArrowRight size={15} />
            </Link>
          )}
        </section>
      </div>
      <footer className="auth-footer">
        Your ideas stay yours. Browser drafts stay on this device.
      </footer>
    </main>
  );
}
