# 0identity

0identity is a developer tool that estimates two separate things for a browser session:

- Human likelihood: whether the session looks like human activity or automation.
- Anonymous subject continuity: whether the session has enough evidence to link to an anonymous subject seen before.

It does not verify a real-world person. Scores are deterministic and explainable. The investigation AI agent can explain stored evidence in the investigation chat, but it does not score or change results.

## Run locally

Use Node 26.5.0 or later.

```sh
npm ci
npm run dev
```

Open the local address shown by Vite.
