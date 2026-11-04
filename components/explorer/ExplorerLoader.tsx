"use client";

import dynamic from "next/dynamic";
import type { Dataset } from "@/lib/types";

const Explorer = dynamic(() => import("./Explorer"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-bg" />,
});

export default function ExplorerLoader({ data, mode }: { data: Dataset; mode?: "public" | "admin" }) {
  return <Explorer data={data} mode={mode} />;
}
