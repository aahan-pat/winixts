# Winixts — Project Vision

## What this is

A JARVIS-style desktop automation agent for Windows. You give it a task in natural
language — typed or eventually spoken — it figures out the steps, executes them on
your desktop, and reports back. You stay focused on what you're doing; the agent handles
the routine.

The system is not a macro recorder or a script runner. It reasons about what's on screen,
adapts when things are in unexpected states, and can sequence multi-step workflows across
different applications without being pre-programmed for each one.

---

## Architecture

```
User
  │  natural language task
  ▼
Orchestrator LLM          ← reasons about the goal, routes to the right sub-agent
  │
  ├── SystemAgent         ← shell commands, system queries (battery, CPU, network, etc.)
  ├── WinAgent            ← discovers windows, reads UI element trees, launches & focuses apps
  ├── InputAgent          ← types text, clicks elements, invokes UI controls via UIA (planned)
  └── [future agents]     ← browser, voice, file system, etc.
        │
        ▼
    Python bridge         ← single subprocess, Win32 + UIA APIs
        │
        ▼
    Windows OS
```

TypeScript owns the reasoning layer (LLM calls, tool dispatch, conversation loop).
Python owns the OS interaction layer (Win32, COM/UIA). They communicate over
newline-delimited JSON on stdin/stdout.

The orchestrator routes tasks to the lightest agent that can handle them. System queries
go to SystemAgent (no window discovery, one tool); desktop interaction goes to WinAgent.
This keeps each agent's tool surface minimal and reduces unnecessary LLM reasoning steps.

---

## Use cases

### System queries
- "What battery percent am I at?"
- "How much memory is free?"
- "What's my IP address?"

### App management
- "Bring up my calendar"
- "Close everything except Chrome and Slack"
- "What do I have open right now?"
- "Open Notepad"

### Productivity workflows
- "Draft an email to [person] about [topic] and leave it ready to send"
- "Fill out this form with [values]"
- "Open the project tracker and update the status on [task] to done"
- "Take notes in [app] while I'm in this meeting"

### Repetitive task automation
Any multi-step workflow you do regularly — opening a set of tools, filing a report,
checking a dashboard — can be described once and delegated. The agent handles the
clicks and keystrokes; you handle the thinking.

### Research and retrieval
- "Search for [thing] and summarize what you find"
- "Check my inbox for anything from [person] this week"
- "Look up [topic] and paste a summary into this document"

---

## Design principles

**Sequential by default.** You ask, it acts, you get a result. This sidesteps the
input-collision problem (agent and user fighting over mouse/keyboard) entirely — the
agent runs while you're waiting for it, not while you're actively typing.

**Least-capable agent first.** The orchestrator routes to the simplest agent that can
handle the task. System queries never touch UIA. Window interaction never runs unnecessary
discovery calls. Each agent only carries the tools it actually needs.

**UIA-first interaction.** For well-behaved apps (Office, Win32, WPF, browsers), the
agent uses the Windows UI Automation COM interface to invoke buttons, fill fields, and
read content directly — no mouse movement, no focus stealing, no fragile coordinate-based
clicking. Synthetic mouse/keyboard input is a fallback for apps that don't expose a UIA
tree.

**Orchestrator + sub-agents.** The top-level LLM reasons about the goal and delegates
to specialized sub-agents. Each sub-agent is stateless and focused on one domain. Adding
a new capability means adding a new agent, not modifying existing ones.

**Observable.** Every tool call the agent makes is printed to the terminal so you can
see exactly what it's doing and catch mistakes before they matter.

**Secure by default.** Each agent carries explicit rules banning destructive commands,
privilege escalation, system modifications, and exposure of internal implementation
details. The system will refuse requests that violate these rules and explain why.

---

## What's built

| Component | Status |
|---|---|
| Python Win32 layer | Done — window enumeration, process info, focus, launch, shell |
| Python UIA layer | Done — element trees, window discovery, focus |
| Python dispatch loop | Done — JSON stdio, both backends wired |
| TypeScript bridge | Done — subprocess lifecycle, request/response |
| Tool registry (`@tool` decorator) | Done |
| SystemAgent | Done — shell commands and system queries, no UIA overhead |
| WinAgent | Done — windows, element trees, focus, launch, run command |
| Orchestrator | Done — routes tasks, spawns SystemAgent or WinAgent |
| CLI (print/input loop) | Done |
| InputAgent | Not started |

---

## Immediate next step

Implement UIA-based input (`Invoke`, `SetValue`, `ExpandCollapse`) in `uia.py` and
expose them through `InputAgent`. This closes the loop from observation to action and
unlocks real end-to-end task execution.
