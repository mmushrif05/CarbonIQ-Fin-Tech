---
name: Defect
about: Something produces the wrong answer, or no answer
labels: defect
---

## What happened

<!-- The request or the screen, and what came back. -->

## What should have happened

## Does it affect a disclosed figure?

<!-- Yes / No / Not sure. A wrong number in a document is treated differently
     from a wrong layout. -->

## Where

- Deployment: <!-- production / staging / local -->
- `/health` says: <!-- paste `commit` and `storage` — it settles "the fix did
  not work" against "the fix has not been deployed", which look identical -->
- Store: <!-- postgres / firebase / memory, from /health -->

## How to reproduce

1.
2.

## Anything in the logs

<!-- The `requestId` from the response header is enough to find the rest. -->
