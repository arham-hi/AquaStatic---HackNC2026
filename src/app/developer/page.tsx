import { Page } from "@/components/shell/app-shell";
import { DeveloperPanel } from "@/components/developer/developer-panel";

export const metadata = { title: "Demo & integrations" };

export default function DeveloperPage() {
  return (
    <Page title="Demo & integrations" subtitle="Judges' remote and integration health. This page exists only when DEMO_MODE=true." wide>
      <DeveloperPanel />
    </Page>
  );
}
