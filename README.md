# ts-io-diffs

Description: TS-IO Diffs generates io-ts codecs and produces various utils for typesafe diff checking. It heavily relies on [ts-to-io](https://github.com/juusaw/ts-to-io) codebase and uses [fast-json-patch](https://www.npmjs.com/package/fast-json-patch) for diff building.

### How it's works

Given two objects (POJOs) with same type T, generate utils which allow you to check for diffs between them in (almost) typesafe manner.

### Installation

```
git clone
yarn
yarn build
node .\cli.js --follow-imports path/to/your/file.ts
```

### Example

Let's assume that you have some model of following shape:

```typescript
import { Option } from 'fp-ts/lib/Option';
type Test = {
	a: string;
	b: number;
	c: Option<{
		d: boolean;
		e: {
			f: string;
		};
	}>;
	g: string;
};
```

and you want to get diff between two objects of abovementioned type:

```typescript
const prevTest: Test = { a: 'foo', b: 777, c: some({ d: true, e: { f: 'azaza' } }), g: 'lol' };
const currentTest: Test = { a: 'bar', b: 777, c: some({ d: false, e: { f: 'azaz' } }), g: 'lol' };
```

#### TODO

Add detailed description of diff checking mechanism.
