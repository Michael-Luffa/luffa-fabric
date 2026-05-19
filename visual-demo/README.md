# Luffa Fabric MVP 1 Basic V2 Visual Demo

Completed by **Luffa AI Research Lab**.

This folder contains a browser-based visual demo for the MVP 1 Basic V2 closed loop.

Run it from the project root:

```bash
pnpm demo:visual
```

Then open:

```text
http://127.0.0.1:5173/
```

What it shows:

- Identity, Permission, Execution, Settlement, and Learning pipeline
- `luffa.create_task` scenario
- Payer/payee Luffa Points settlement
- Execution, settlement, reputation, and Merkle Root audit states
- Canvas preview with an in-browser WebM recording button

The recording button uses `HTMLCanvasElement.captureStream()` and `MediaRecorder`, so it works in modern Chromium-based browsers without `ffmpeg`.
