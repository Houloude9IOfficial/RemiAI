import { FileManagerPage } from "@/components/files/FileManagerPage";

export const metadata = {
  title: "Files — RemiAI",
  description: "Manage the files each chat's AI has access to.",
};

export default function FilesPage() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <FileManagerPage />
    </div>
  );
}
