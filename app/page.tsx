import ExplorerLoader from "@/components/explorer/ExplorerLoader";
import { loadDataset } from "@/lib/data/load";

export const revalidate = 300;

export default async function Page() {
  const data = await loadDataset();
  return (
    <div className="h-dvh w-full">
      <ExplorerLoader data={data} />
    </div>
  );
}
