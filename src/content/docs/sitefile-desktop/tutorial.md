---
title: "Tutorial: your first site"
description: "Serve a site from your Mac, open it in the browser, and open it on your phone."
sidebar:
  order: 1
---

You will serve a site from your Mac, open it in the browser, and open it on your phone.
It takes a few minutes and needs nothing but the app. If the app isn't installed yet,
see [Install and open the app](/sitefile-desktop/how-to/#install-and-open-the-app).

## 1. Open the app

Open **Sitefile Desktop**. With no servers, images or projects, the Servers page offers
three ways in: **Build the Example**, **Serve a Folder…** and **Add a Project…**.

![The first-run Servers page with three ways in](/sitefile-desktop/first-run-light.png)

## 2. Build the example

Choose **Build the Example**. The app builds the example site that ships with it (it keeps a
copy in `~/.sitefile/desktop/example/` so you can edit it later) into an image tagged
`hello:latest`, then serves that image. It needs no network and no plugins.

When it finishes, the Servers page lists a running server with its address.

## 3. Open it

Select the server and choose **Open in Browser** (Shift-Command-O). The example site opens at
the server's address, which is on this Mac only (`127.0.0.1`).

## 4. See what you made

- **Images** (Command-2) lists `hello:latest`, the image the server is serving.
- **Builds** (Command-4) lists the build that made it. **Open Log** shows its output.
- **Activity** (Command-7) records what you did, with Undo.

## 5. Open it on your phone

On the server, choose **Share to Phone**. Because the server is on this Mac only, the app first
says what sharing means: the server restarts on the same port on every network this Mac is on,
protected by a password kept in your Keychain, and macOS may ask to allow incoming connections.
Confirm, then scan the QR code with your phone's camera (the phone must be on the same Wi-Fi)
and enter the user and password shown. The code holds only the address (sitefile's login has no one-time link, so the password
isn't put in it).

Anyone on the network who has the password can open the site, so use networks you trust.

![A server shared to the network, with its QR code](/sitefile-desktop/server-shared-light.png)

## 6. Serve your own folder

Choose File > **Serve…** (Command-N), pick a folder of HTML (or drop it on the window), and
choose **Serve**. It appears on Servers beside the example. To stop either, select it and
choose **Stop** (Shift-Command-Period).

## Where next

- Build a project that has a Sitefile: [Build a Sitefile into an image](/sitefile-desktop/how-to/#build-a-sitefile-into-an-image).
- Why plugins ask permission: [Plugins and trust](/sitefile-desktop/how-to/#plugins-and-trust) and
  [how the app works](/sitefile-desktop/explanation/#trust).
- Every other job: the [how-to guides](/sitefile-desktop/how-to/).
