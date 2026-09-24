import { LibraryPage } from "@/components/files/LibraryPage";

export const metadata = {
  title: "Files — RemiAI",
  description: "Browse every file created or uploaded across your chats.",
};

export default function FilesPage() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <LibraryPage />
    </div>
  );
}
