"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="center-state">
      <span className="eyebrow">CONNECTION INTERRUPTED</span>
      <h1>Your workspace couldn’t load.</h1>
      <p>
        Please retry. If this is a new installation, check the Supabase
        configuration and database migrations.
      </p>
      <button className="primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
