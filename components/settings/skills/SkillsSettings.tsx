"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SkillLibrary } from "./SkillLibrary";
import { SkillRepos } from "./SkillRepos";

export type SkillsTab = "library" | "repositories";

export function SkillsSettings() {
  const [tab, setTab] = useState<SkillsTab>("library");

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab((value as SkillsTab) ?? "library")}
    >
      <TabsList className="h-9 w-full">
        <TabsTrigger value="library">Library</TabsTrigger>
        <TabsTrigger value="repositories">Repositories</TabsTrigger>
      </TabsList>

      <TabsContent value="library">
        <SkillLibrary onNavigate={setTab} />
      </TabsContent>
      <TabsContent value="repositories">
        <SkillRepos />
      </TabsContent>
    </Tabs>
  );
}
