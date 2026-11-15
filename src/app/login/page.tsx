"use client";

import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { login } from "@/app/actions";

function LoginForm() {
  const next = useSearchParams().get("next") ?? "/";
  const [state, action, pending] = useActionState(login, {});
  return (
    <form action={action} className="card w-full max-w-sm space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">Radar</h1>
        <p className="text-sm text-zinc-500">Enter your password to continue.</p>
      </div>
      <input type="hidden" name="next" value={next} />
      <input name="password" type="password" autoFocus required className="input" placeholder="Password" />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
