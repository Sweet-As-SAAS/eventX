"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { nzToday } from "@/lib/deadlines";
import type { Licence } from "@/lib/schemas";
import { daysBetween, fmtDate } from "@/components/format";
import { useFail } from "@/components/toast";
import { Skeleton, Title, cx } from "@/components/ui";

// Licences and certificates your team holds, soonest to expire first.
export default function LicencesPage() {
  const fail = useFail();
  const [licences, setLicences] = useState<Licence[] | null>(null);
  const today = nzToday();
  useEffect(() => {
    api.licences().then((l) => setLicences([...l].sort((a, b) => a.expiresOn.localeCompare(b.expiresOn)))).catch(fail);
  }, [fail]);

  return (
    <div className="max-w-[1200px] space-y-8 px-4 py-10 sm:px-10">
      <Title sub="We remind you before each one runs out, so you can renew in time.">Licences</Title>
      <ul className="overflow-hidden rounded-2xl border border-border">
        {licences?.map((l) => {
          const left = daysBetween(today, l.expiresOn);
          const soon = left < 90;
          return (
            <li key={l.id} className={cx("flex items-center justify-between gap-4 border-b border-border px-6 py-4 last:border-b-0", soon && "bg-warning-soft/40")}>
              <div>
                <p className="text-base font-semibold text-foreground">{l.type}</p>
                {l.holderName && <p className="text-sm text-neutral-600">{l.holderName}</p>}
              </div>
              <p className={cx("text-right text-sm", soon ? "font-semibold text-warning" : "text-neutral-600")}>
                {left < 0 ? `Expired ${fmtDate(l.expiresOn)}` : soon ? `Renew soon, ${left} days left` : `Expires ${fmtDate(l.expiresOn)}`}
              </p>
            </li>
          );
        })}
        {!licences && <li className="px-6 py-4" aria-hidden><Skeleton className="h-5 w-1/2" /></li>}
        {licences?.length === 0 && <li className="px-6 py-4 text-base text-neutral-600">No licences saved yet.</li>}
      </ul>
    </div>
  );
}
