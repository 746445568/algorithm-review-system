# Windows packaging

This directory is reserved for the Windows installer flow of OJ Review Desktop.

## Planned packaging responsibilities

- ship the WinUI desktop shell
- ship the `ojreviewd` local service binary
- initialize first-run application directories
- preserve SQLite data across upgrades
- surface migration and rollback failures to the user

## Packaging target

- one-click Windows installer
- data stored under the current user's local app data directory

## Current binary placement contract

The WinUI shell looks for the local service binary in one of these locations:

- `Service/ojreviewd.exe` beside the desktop executable
- `ojreviewd.exe` beside the desktop executable
- `%LOCALAPPDATA%/OJReviewDesktop/bin/ojreviewd.exe`
