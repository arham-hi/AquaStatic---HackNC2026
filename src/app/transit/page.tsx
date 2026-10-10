import { Page } from "@/components/shell/app-shell";
import { TransitPage } from "@/components/transit/transit-page";

export const metadata = { title: "Transit" };

export default function Transit() {
  return (
    <Page title="Transit" subtitle="Chapel Hill Transit routes and stops around campus, from the official GTFS schedule feed." wide>
      <TransitPage />
    </Page>
  );
}
