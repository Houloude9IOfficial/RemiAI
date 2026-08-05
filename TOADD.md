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

<!-- Centerize visualizations by default, and allow to be aligned left/right if needed. -->

<!-- Add session file storage (mostly txt, md, py, js, etc...) and have tools to modify them (same as now the file management system tools, but for sandboxes only for each chat), and also have a present tool to show the user a file/files -->

<!-- Add a file manager section to the dashboard, and allow the user to manage the files that are associated with each chat & the AI has access to, with options to create, edit, delete, download and organize files. -->

<!-- when opening on deployment the website, it sometimes loads /chat/1 and stays loading, on mobile it doesnt show the sidebar and it stays stuck on loading, and on desktop it shows the sidebar but the chat content is empty and it stays loading. Fix this. -->

<!-- tool cards have 2 scroll bars on console output. -->

<!-- add controls to messages, copy for yours and copy + regenerate for AI messages (say that it'll delete all messages after it if any exist.)

Make file manager render media too, audio, video, images, etc... -->

Make files uploaded in a chat, to automatically be added /shown to the file manager for that chat, and allow the AI to access them. Save in a folder in session files called 'uploads' and allow the AI to access them. Also allow the user to manage them in the file manager (already done).

on new chat, make after ai's first response, to do a quick request to an ai with the 2 messages in the chat & generate a quick title for the chat, e.g 'Particle Engine Error Fix'. All in bg, not in user's side, so he can leave.

<!-- make accent color configurable in profile settings. -->

<!-- Make on start of new chat, to remove suggestions, move chat input as a bigger in the center & middle, keep the headline, kind of how code editors are. And on start, to smoothly move it as it is now. -->

<!-- if an AI request fails, retry up to 3 times before erroring out. -->

<!-- allow resizing the session files panel. -->

when there're too many tool calls in a row make them all into a group instead, not multiple calls/group of calls. But only for calls in a row without text in between.

file attaching from allowed dirs shows only top folders, but on open, it doesnt show any content inside, whether files or folders. Fix this.