"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { ALLOWED_STAGES, type Stage } from "@/lib/enums";

const STAGE_LABEL: Record<string, string> = {
  introduced: "INTRODUCED",
  in_committee: "IN COMMITTEE",
  passed_first_chamber: "PASSED 1ST CHAMBER",
  passed_second_chamber: "PASSED BOTH CHAMBERS",
  signed: "SIGNED",
  vetoed: "VETOED",
  dead: "DEAD",
};

export function StageFilter({
  current,
  basePath = "/",
  availableStages = ALLOWED_STAGES,
}: {
  current: string | undefined;
  basePath?: string;
  availableStages?: readonly Stage[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function onChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("stage", value);
    else params.delete("stage");
    params.delete("expanded");
    params.delete("page");
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `${basePath}?${qs}` : basePath);
    });
  }

  return (
    <select
      value={current ?? ""}
      onChange={(e) => onChange(e.target.value)}
      disabled={isPending}
      className="rounded-sm border px-2 py-1 text-[12px] font-medium uppercase tracking-[0.5px] focus:outline-none"
      style={{
        backgroundColor: "var(--bg-base)",
        color: "var(--text-secondary)",
        borderColor: "var(--border-strong)",
      }}
    >
      <option value="">ALL STAGES</option>
      {availableStages.map((s) => (
        <option key={s} value={s}>
          {STAGE_LABEL[s]}
        </option>
      ))}
    </select>
  );
}
