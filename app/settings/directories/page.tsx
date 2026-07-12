import { DirectoryForm } from "@/components/settings/DirectoryForm";
import { DirectoryTable } from "@/components/settings/DirectoryTable";

export default function DirectoriesSettingsPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Directories</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Grant RemiAI read/write access to specific folders on your computer.
          The AI can only see and modify files inside directories you add here.
        </p>
      </div>
      <DirectoryForm />
      <DirectoryTable />
    </div>
  );
}
