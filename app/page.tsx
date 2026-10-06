"use client";

import dynamic from "next/dynamic";

const Dashboard = dynamic(
  () => import("@/components/Dashboard").then((mod) => mod.Dashboard),
  { ssr: false, loading: () => <div className="app" /> },
);

export default function Page() {
  return <Dashboard />;
}
