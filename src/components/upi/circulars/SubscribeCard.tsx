import { FormEvent, useState } from "react";
import { Mail } from "lucide-react";
import { BentoCard } from "@/components/upi/BentoCard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { analytics } from "@/lib/analytics";

// The Railway server that owns the subscribe/confirm/unsubscribe flows
// (server/ in this repo). Unset in a build = the whole card disappears, so
// the static site never renders a form that can't submit.
const SERVER_URL = (import.meta.env.VITE_SERVER_URL as string | undefined)?.replace(/\/$/, "");

const ROLES = ["Compliance", "Product", "Engineering", "Founder", "Analyst", "Legal", "Other"];

type Status = "idle" | "submitting" | "done";

export function SubscribeCard() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [customRole, setCustomRole] = useState("");
  // Honeypot — hidden from humans; the server treats any value as a bot.
  const [website, setWebsite] = useState("");

  if (!SERVER_URL) return null;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      analytics.circularSubscribeOpened();
    } else {
      // Leave the fields as-is (accidental dismiss shouldn't wipe typing),
      // but clear transient state so reopening starts clean.
      setStatus("idle");
      setError(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const resolvedRole = role === "Other" ? customRole.trim() : role;
    if (!resolvedRole) {
      setError("Please pick your role.");
      return;
    }
    setStatus("submitting");
    setError(null);
    try {
      const res = await fetch(`${SERVER_URL}/api/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, company, role: resolvedRole, website }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) {
        throw new Error(body.error ?? "Something went wrong — please try again.");
      }
      analytics.circularSubscribeSubmitted(true);
      setStatus("done");
    } catch (err) {
      analytics.circularSubscribeSubmitted(false);
      setStatus("idle");
      setError(
        err instanceof TypeError
          ? "Could not reach the subscription service — please try again in a minute."
          : err instanceof Error
            ? err.message
            : "Something went wrong — please try again.",
      );
    }
  }

  return (
    <>
      <BentoCard className="!p-5 lg:!p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-start gap-3 flex-1">
            <Mail className="size-5 mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <h2 className="font-serif text-lg leading-snug">Never miss a circular</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Get every new NPCI circular in your inbox — summary, full text and the original PDF.
              </p>
            </div>
          </div>
          <Button className="shrink-0 sm:self-center" onClick={() => handleOpenChange(true)}>
            Subscribe
          </Button>
        </div>
      </BentoCard>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          {status === "done" ? (
            <>
              <DialogHeader>
                <DialogTitle>✉️ Almost there!</DialogTitle>
                <DialogDescription>
                  We've sent a confirmation link to <strong>{email.trim()}</strong>. Click it to
                  activate your subscription.
                </DialogDescription>
              </DialogHeader>
              <Button className="mt-2" onClick={() => handleOpenChange(false)}>
                Done
              </Button>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Subscribe to new circulars</DialogTitle>
                <DialogDescription>
                  One email per circular, as soon as it's published on npci.org.in.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="subscribe-name">Name</Label>
                  <Input
                    id="subscribe-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    maxLength={200}
                    autoComplete="name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="subscribe-email">Work email</Label>
                  <Input
                    id="subscribe-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    maxLength={320}
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="subscribe-company">Company</Label>
                  <Input
                    id="subscribe-company"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    required
                    maxLength={200}
                    autoComplete="organization"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="subscribe-role">Role</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger id="subscribe-role">
                      <SelectValue placeholder="Select your role" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {role === "Other" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="subscribe-custom-role">Your role</Label>
                    <Input
                      id="subscribe-custom-role"
                      value={customRole}
                      onChange={(e) => setCustomRole(e.target.value)}
                      required
                      maxLength={100}
                    />
                  </div>
                )}
                {/* Honeypot: invisible to people, tempting to bots. */}
                <div className="absolute -left-[9999px] top-auto" aria-hidden>
                  <label htmlFor="subscribe-website">Website</label>
                  <input
                    id="subscribe-website"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <Button type="submit" className="w-full" disabled={status === "submitting"}>
                  {status === "submitting" ? "Subscribing…" : "Subscribe"}
                </Button>

                <p className="text-xs text-muted-foreground border-t pt-3">
                  🔒 We only use your details to send you new NPCI circulars. No sharing, no
                  selling. Unsubscribe anytime with one click.
                </p>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
