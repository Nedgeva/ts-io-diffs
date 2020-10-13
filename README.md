# ts-io-diffs

Description: TS-IO Diffs generates io-ts codecs and produces various utils for typesafe diff checking. It heavily relies on [ts-to-io](https://github.com/juusaw/ts-to-io) codebase and uses [fast-json-patch](https://www.npmjs.com/package/fast-json-patch) for diff building.

### How it's works

Given two objects (POJOs) with same type T, generate utils which allow you to check for diffs between them in (almost) typesafe manner.

#### TODO

Add detailed description of diff checking mechanism.
