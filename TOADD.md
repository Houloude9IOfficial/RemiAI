<!-- Customizable:

How to be called
Likings
How the AI should be

Memory:
Allow AI to save memory snapshots (sentences) that will always be sent to AI at first message as context, and be able to be fuzzy searched. And user could manage them in a page.Also -->

<!-- add an Agent spawner system, allow AI to spawn seperate agents to do stuff, and have options, such as 'wait-until-completion' to wait for that agent, etc.. Agents should be e.g side or important stuff/research where you need a summary or something specific, to not blow the token count unnecessary. -->

<!-- add about screen with logo, github repo, copyright, etc -->

<!-- create logo -->

add agent support to work at background (such as cron jobs, heartbeats, etc...). Have pages for management too.

<!-- add on input marking, e.g @FILE to be able to tag files, and allow the AI to easily understand what to do. -->


<!-- add logo to web favicon -->

add a plan mode for stuff

add actual file attachments, and also allow ctrl + v to paste attachments or via drag-n-drop in the chat input area

<!-- add an ask questions tool and allow asking up to 7 questions with 3 choices + custom. -->

<!-- if an error occurs, show the message in a card and allow retry from where it was left. 
add a create directory tool (only in directories allowed writing)
add a delete folder and directory tool (only in directories allowed writing and warn the AI to be sure before doing). -->

Fix MCP page layout and on test it's modal

Feature: Actions
Descriptions: A tool (togglable) that allows the AI with javascript to create actions, be saved in a library, and be able to run them at any point.

New feature:
    Feature Name: File Watching
    Description: Implement a feature that automatically indexes new or modified files in the background. This will keep the local context fresh without requiring manual searches or extra clicks.
    Implementation Steps:
        Set up a file watcher that monitors specified directories for changes.
        Index new or modified files automatically.
        Update the local context to include the new or modified files.
        Ensure the feature runs in the background without disrupting the user's workflow.

This feature will enhance the user experience by keeping the local context up-to-date and reducing the need for manual intervention.