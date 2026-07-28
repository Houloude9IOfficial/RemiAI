#!/usr/bin/env tsx
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { resetPassword } from "@/lib/auth/service";

const rl = readline.createInterface({ input, output });
const password = await rl.question("New RemiAI password (8+ characters): ");
rl.close();
if (password.length < 8) throw new Error("Password must be at least 8 characters.");
resetPassword(password);
console.log("Password reset. All existing sessions were revoked.");
