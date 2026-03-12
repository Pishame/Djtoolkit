# DJ Production Suite Bridge Contract v1

This document defines the stable Python <-> AI Studio bridge contract used by the app.

- Contract version: `1.0`
- Backend source of truth: Python (`app_pyside.py`)
- Frontend role: presentation/UI only (`Aistudio`)
- Transport: Qt WebChannel + browser custom events

## Overview

The UI sends JSON commands to Python through `pyBridge.bridgeCommand(commandJson)`.

Python sends UI-safe events to the web app via:

- `window.dispatchEvent(new CustomEvent("djtoolkit:v1:event", { detail: payload }))`

Legacy bridge methods remain available for compatibility:

- `runToolkitOption(option, payloadJson)`
- `stopToolkit()`
- `pickFolder(key, currentPath)`

## Command Envelope

All v1 commands use this envelope:

```json
{
  "version": "1.0",
  "requestId": "string",
  "command": "string",
  "payload": {}
}
```

## Response Envelope

All v1 command responses use this envelope:

```json
{
  "version": "1.0",
  "requestId": "string",
  "ok": true,
  "data": {}
}
```

Error response:

```json
{
  "version": "1.0",
  "requestId": "string",
  "ok": false,
  "error": {
    "code": "E_*",
    "message": "human readable error"
  }
}
```

## Commands

### `toolkit.run_option`

Run a toolkit option.

Request payload:

```json
{
  "option": "1",
  "payload": {
    "urls": ["https://..."],
    "output_path": "C:/Users/User/Downloads/DJDownloads/MP4"
  }
}
```

Response `data`:

```json
{
  "accepted": true
}
```

### `toolkit.stop`

Stop the active toolkit job.

Request payload:

```json
{}
```

Response `data`:

```json
{
  "accepted": true
}
```

### `system.pick_folder`

Open folder picker (native dialog).

Request payload:

```json
{
  "key": "mp3",
  "currentPath": "C:/Users/User/Downloads/DJDownloads/MP3"
}
```

Response `data`:

```json
{
  "path": "C:/Users/User/Downloads/DJDownloads/MP3"
}
```

If cancelled, `path` can be empty string.

### `system.get_state`

Return current normalized UI state snapshot.

Request payload:

```json
{}
```

Response `data` is the same schema as the event payload below.

## Events

### Event name

`djtoolkit:v1:event`

### Event payload schema

```json
{
  "version": "1.0",
  "event": "toolkit.status",
  "timestamp": "2026-02-21T12:34:56",
  "data": {
    "job": {
      "id": "1",
      "name": "Downloading YouTube Video",
      "option": "1",
      "running": true,
      "state": "running",
      "stateLabel": "Downloading",
      "progress": 42,
      "canCancel": true
    },
    "metrics": {
      "etaText": "00:41 remaining",
      "speedText": "2.3 MB/s"
    },
    "output": {
      "folderPath": "C:/Users/User/Downloads/DJDownloads/MP4",
      "fileName": "mytrack.mp4",
      "filePath": "C:/Users/User/Downloads/DJDownloads/MP4/mytrack.mp4",
      "sourceUrl": "https://youtube.com/watch?v=..."
    },
    "message": "File saved successfully"
  }
}
```

## Normalized Job State

`data.job.state` is adapter-mapped by Python into UI-safe states:

- `idle`
- `preparing`
- `running`
- `completed`
- `failed`

`stateLabel` is human-readable status text from backend UI labels.

## Compatibility Notes

- v1 is additive and keeps legacy methods intact.
- Frontend should prefer `bridgeCommand` + `djtoolkit:v1:event`.
- Backend internals/process details are not part of this contract.

