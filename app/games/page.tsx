import Image from "next/image";
import Link from "next/link";
import { Gamepad2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import tictactoeLogo from "../../assets/games/tictactoe.png";
import connect4Logo from "../../assets/games/connect4.png";

const games = [
  {
    title: "Tic Tac Toe",
    description: "Classic 3-in-a-row. Play against an AI that won't go easy on you.",
    href: "/games/tic-tac-toe",
    logoSrc: tictactoeLogo,
    gradient: "from-blue-500/10 via-blue-500/5 to-transparent",
    borderColor: "border-blue-500/20 hover:border-blue-500/40",
    difficulty: "Easy to learn, hard to master",
    players: "vs AI",
  },
  {
    title: "Connect 4",
    description: "Drop your pieces and be the first to get 4 in a row.",
    href: "/games/connect-4",
    logoSrc: connect4Logo,
    gradient: "from-yellow-500/10 via-yellow-500/5 to-transparent",
    borderColor: "border-yellow-500/20 hover:border-yellow-500/40",
    difficulty: "Strategy required",
    players: "vs AI",
  },
];

export default function GamesPage() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-10">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/20">
              <Gamepad2 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <h1 className="text-2xl font-bold">Games</h1>
          </div>
          <p className="text-muted-foreground ml-[3.25rem]">
            Challenge the AI in classic strategy games.
          </p>
        </div>

        {/* Game cards grid */}
        <div className="grid gap-5 sm:grid-cols-2">
          {games.map((game) => {
            return (
              <Link key={game.href} href={game.href} className="group block">
                <Card
                  className={cn(
                    "relative overflow-hidden transition-all duration-300",
                    "bg-gradient-to-br",
                    game.gradient,
                    game.borderColor,
                  )}
                >
                  {/* Hover glow */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-white/5 to-transparent" />

                  <CardHeader className="flex flex-row items-start gap-4">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl">
                      <Image
                        src={game.logoSrc}
                        alt={game.title}
                        className="h-full w-full object-cover"
                        width={48}
                        height={48}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg group-hover:text-foreground transition-colors">
                        {game.title}
                      </CardTitle>
                      <CardDescription className="mt-1.5">
                        {game.description}
                      </CardDescription>
                    </div>
                  </CardHeader>

                  <CardContent>
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary" className="text-[11px]">
                        {game.difficulty}
                      </Badge>
                      <Badge variant="outline" className="text-[11px]">
                        {game.players}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

