---
title: "Keyboard shortcuts and menus"
description: "Every menu item and key."
sidebar:
  order: 5
---

Taken from the app's menus. An item with no key is menu-only. Items that need a selection
(a server, an image, a build, a project) are dimmed without one. Page menus act on the row
selected on that page, or the page that is open.

## Menu bar

### File

| Item | Key |
|---|---|
| Serve… | Command-N |
| Add… (a project) | Shift-Command-N |
| Import Servers… | |
| Export Servers… | |

### Edit

| Item | Key |
|---|---|
| Search… (servers, images, projects and builds) | Command-K |
| Filter (the page's filter field) | Command-F |

### View

| Item | Key |
|---|---|
| Servers | Command-1 |
| Images | Command-2 |
| Projects | Command-3 |
| Builds | Command-4 |
| Plugins | Command-5 |
| Logs | Command-6 |
| Activity | Command-7 |
| Open Web UI | |
| Refresh | Command-R |

The View menu also has the system's Show/Hide Sidebar and Inspector items.

### Server

| Item | Key |
|---|---|
| Open in Browser | Shift-Command-O |
| Restart (Start, when stopped) | |
| Stop | Shift-Command-Period |
| Share to Phone… | |
| Update | |
| Pin to Image (Unpin) | |
| Save as Image… | |
| Show Logs | |
| Locate… | |
| Remove (Forget, when its folder is gone) | |

With several servers ticked, the last item becomes the bulk actions, each with a count.

### Project

| Item | Key |
|---|---|
| Build… | Shift-Command-B |
| Show in Finder | |
| Locate… | |
| Remove… (Forget…, when its folder is gone) | |

### Image

| Item | Key |
|---|---|
| Serve… | |
| Tag… | Option-Command-T |
| Save… | Option-Command-S |
| Copy Image ID | |
| Remove… (with a count, when several are selected) | |
| Prune Unused Images… | |

Delete in the Images table removes the selection too. It has no menu key, so it can't fire
while you type in a field.

### Build

| Item | Key |
|---|---|
| Stop Build | Command-Period |
| Rebuild | |
| Build Again… | |
| Open Log | |
| Open This Build | |
| Compare Builds | |
| Remove from History | |
| Clear (submenu, with counts) | |

### Window

| Item | Key |
|---|---|
| Show Window | Command-0 |

### App menu

| Item | Key |
|---|---|
| Settings… | Command-Comma |
| Install 'sitefile' Command… (opens Settings > General) | |

## Elsewhere

| Where | Key | Does |
|---|---|---|
| Tables with more rows than the page size | Option-Command-Left / Right | Previous / next page (the pager also has First and Last) |
| Search panel (Command-K) | Up / Down, Escape | Move through results, close |
| Dialogs and sheets | Return, Escape | The default button, Cancel |

## Menu-bar item

The menu-bar item lists the running servers, each with buttons to open and stop it, then
**Show Window** (Command-0), **Open Web UI**, and **Quit (servers keep running)** (Command-Q).
