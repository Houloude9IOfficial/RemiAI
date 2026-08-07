<!-- Customizable:

How to be called
Likings
How the AI should be

Memory:
Allow AI to save memory snapshots (sentences) that will always be sent to AI at first message as context, and be able to be fuzzy searched. And user could manage them in a page.Also -->

<!-- add an Agent spawner system, allow AI to spawn seperate agents to do stuff, and have options, such as 'wait-until-completion' to wait for that agent, etc.. Agents should be e.g side or important stuff/research where you need a summary or something specific, to not blow the token count unnecessary. -->

<!-- add about screen with logo, github repo, copyright, etc -->

<!-- create logo -->

<!-- SKIPPED FOR NOW: add agent support to work at background (such as cron jobs, heartbeats, etc...). Have pages for management too. -->

<!-- add on input marking, e.g @FILE to be able to tag files, and allow the AI to easily understand what to do. -->


<!-- add logo to web favicon -->

<!-- add a plan mode for stuff -->

<!-- add actual file attachments, and also allow ctrl + v to paste attachments or via drag-n-drop in the chat input area -->

<!-- add an ask questions tool and allow asking up to 7 questions with 3 choices + custom. -->

<!-- if an error occurs, show the message in a card and allow retry from where it was left. 
add a create directory tool (only in directories allowed writing)
add a delete folder and directory tool (only in directories allowed writing and warn the AI to be sure before doing). -->

<!-- Fix MCP page layout and on test it's modal -->

<!-- Add a slide to collapse/uncollapse extra pages in sidebar -->

<!-- Add Built-in vector store option so the local assistant can index files for semantic search (Added & Removed, took up a lot of uneeded memory) -->

<!-- Feature: Routines
Descriptions: A tool (togglable) that allows the AI with javascript to create routines, be saved in a library, and be able to run them at any point. -->

<!-- add background voice support (e.g jarvis), play a looped smooth noise while working on request, create a new chat, allow all tools and stuff, optimize for speed. Optimize for windows & mac support -->

<!-- create a website -->

<!-- rename customize to 'Profile' allow adding profile picture too, and other personal details for the AI to know and use. Also allow more customization of the AI. -->

<!-- fix output/input token chat stats to always work -->

<!-- make the chat on start be a sorter chat input on middle lower-center of the screen, and then smoothly extend to it's normal full size and move to the bottom -->

<!-- new chats arent on top and creation/update times arent on users timezone -->

<!-- Make the AI on first message consider checking time (get_time_details) and recent changes (query_recent_changes) to have more context or reply with any means. -->

<!-- add a games page to include a library of games e.g tic tac toe to play with the AI, onclick opens a page specific to that game, and AI is included in, and maybe on e.g tic tac toe, it could also react to player's moves, such as 'Now you locked me bro', and others. -->

<!-- Allow backing up and restoring user data & api keys (encrypted with password) (for e.g db cleanups on migrations, to not get all data removed and have to start all over) -->

<!-- Fix screenshot reading -->

<!-- show profile on bottom of sidebar like chatgpt.com -->

<!-- create into electron app, add mac/windows support, native features & include CI/CD to build the app installer. -->

<!-- make app have logo, and optimize for MacOS -->

<!-- move tools into a tool search tool, so it doesn't overload context from beggining if not needed (14k+ tokens down to 3k tokens) -->

<!-- tell ai if needed to add followup suggestions on bottom, in a specific format. -->

<!-- if using ollama provider, make it include <think> process as tool. -->

<!-- on message send scroll bottom in chat content, and focus on msg input. -->

<!-- make the dashboard fully mobile friendly, and allow to be used on mobile devices, and also allow to be installed as a PWA (Progressive Web App) on mobile devices. -->

<!-- remove shadows, border and additional text from visualizations, and make them more clean and simple. -->

<!-- remove icon background from tool calling visual text -->




<!-- V2  -->


<!-- Centerize visualizations by default, and allow to be aligned left/right if needed. -->

<!-- Add session file storage (mostly txt, md, py, js, etc...) and have tools to modify them (same as now the file management system tools, but for sandboxes only for each chat), and also have a present tool to show the user a file/files -->

<!-- Add a file manager section to the dashboard, and allow the user to manage the files that are associated with each chat & the AI has access to, with options to create, edit, delete, download and organize files. -->

<!-- when opening on deployment the website, it sometimes loads /chat/1 and stays loading, on mobile it doesnt show the sidebar and it stays stuck on loading, and on desktop it shows the sidebar but the chat content is empty and it stays loading. Fix this. -->

<!-- tool cards have 2 scroll bars on console output. -->

<!-- add controls to messages, copy for yours and copy + regenerate for AI messages (say that it'll delete all messages after it if any exist.)

Make file manager render media too, audio, video, images, etc... -->

<!-- Make files uploaded in a chat, to automatically be added /shown to the file manager for that chat, and allow the AI to access them. Save in a folder in session files called 'uploads' and allow the AI to access them. Also allow the user to manage them in the file manager (already done). -->

<!-- make accent color configurable in profile settings. -->

<!-- Make on start of new chat, to remove suggestions, move chat input as a bigger in the center & middle, keep the headline, kind of how code editors are. And on start, to smoothly move it as it is now. -->

<!-- if an AI request fails, retry up to 3 times before erroring out. -->

<!-- allow resizing the session files panel. -->

<!-- file attaching from allowed dirs shows only top folders, but on open, it doesnt show any content inside, whether files or folders. Fix this. -->

<!-- File manager editor is bad, not theme friendly, and on paste of text, it pastes all as one line getting outside the container, no formatting & more. Fix this. -->

<!-- get time for ai gets the timezone from the server, not the user, and it should get the timezone from the user instead. Fix this.

searching should use if possible user's location/region to get more relevant results. -->

<!-- when writing a file in a non existent folder, it should create the folder and then write the file (but note in result that it created new folder). Fix this. -->

<!-- tell the ai for big projects to use permitted dirs if possible and avoid session files, and if it needs to use session files, to use them only for temporary stuff and not for important files. -->

<!-- after answering questions in plan mode, set mode to goal.

add checkboxes to question tools and allow more flexibility in the questions, such as allowing multiple answers, and allow to add more than 7 questions. -->

<!-- allow editing session files & permitted dirs files with changing lines, no need to rewrite the whole file, and allow to add new lines, and also allow to delete lines. -->

<!-- allow running bash cmds fully, add in code execution tool.

when activelly having todo tasks, when managing files/folders (CRUD) combine the tools in one group as thinking, so it wont show hundreds of tools in a row. example of bad: 
`Created directory
Worked for 1ms
·
1 file
1 file changed
components/ui

Wrote file
Worked for 100ms
·
1 file
1 file changed
ui/Logomark.tsx
+181

Wrote file
Worked for 1ms
·
1 file
1 file changed
package.json
+41

Wrote file
Worked for 1ms
·
1 file
1 file changed
next.config.mjs
+19

Wrote file
Worked for 1ms
·
1 file
1 file changed
tsconfig.json
+30

Wrote file
Worked for 100ms
·
1 file
1 file changed
tailwind.config.ts
+159

Wrote file
Worked for 100ms
·
1 file
1 file changed
postcss.config.mjs
+6

Created directory
Worked for 1ms
·
1 file
1 file changed
Silkon/src

Created directory
Worked for 100ms
·
1 file
1 file changed
src/app
` -->

<!-- make writing files/folders to permitted dirs easier, AI models often have issues with selecting parent folders, and it should be easier to select the parent folder, and also allow to create new folders if needed. -->

<!-- Make questions tool more modern, asthetically pleasing and show in bottom of message -->

<!-- make simply all tool calls with no text between them, to be grouped altogether, and show as one tool call, instead of showing each tool call as a separate one and bloating the UI. -->

<!-- sometimes ai may return many followup tool runs, show only 1. and specify to not ask questions in followups e.g 'What do you want to do next?' or 'What should I do next?'. -->

<!-- Optimize the app, 41k input tokens for a simple 'hi' is fully unacceptable, and it should be optimized to use way less. (it did use 3 tools but still unacceptable, and it should be optimized to use way less tokens for simple requests, and also for complex requests, it should be optimized to use way less tokens too.) -->

<!-- remove todo card from showing in chat on tool run, keep only the header show. -->

<!-- add timeouts to bash execute tool and if times out, cancel the run of the bash command, and return the output of the console until the timeout, and also return a message that it timed out.

the ai users bash to write/edit/delete files, but it should use bash for commands only, and use the file management tools to manage files/folders, and not bash. -->

<!-- if pasting a way too long text in input it should attach it as a file instead of pasting it in the input. It breaks the input and makes it too large now. -->

<!-- make session files panel update in real time when files are added/removed/edited, and also make it update when the AI creates/edits/deletes files/folders in permitted dirs. -->

<!-- make copy/regenerate on messages to be shown on hover, and not always visible, to make the UI cleaner. On mobile always show it, since hover is not possible. -->