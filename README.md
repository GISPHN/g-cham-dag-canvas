# G-CHAM DAG Canvas

G-CHAM DAG Canvas is a Japanese-first web application for learning and designing causal inference with directed acyclic graphs (DAGs).

The application is designed to connect:

- research question structuring with HAPECOM, PECO, and PICO
- graphical DAG editing
- exposure and outcome designation
- adjustment-set exploration
- backdoor-path visualization
- collider and mediator warnings
- local project persistence
- JSON-based project export and import

## Status

Initial implementation in progress.

## Design principle

The application does not infer that a causal relationship is scientifically true. It evaluates the logical consequences of the causal assumptions entered by the user.

## Planned deployment

GitHub Pages, with all project data stored locally in the browser or exported by the user. No server or account is required for the MVP.

## Development

```bash
npm install
npm run dev
```

## License

License selection is intentionally deferred until the causal-analysis implementation and third-party dependency strategy are finalized.
