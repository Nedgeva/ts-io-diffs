type Test = {
	a: string;
	b: number;
	c: {
		d: boolean;
		e: {
			f: string;
		};
	};
	g: string;
};

type Test2 = {
	one: string;
	two: number;
};

/* type DiffTree<T extends Record<string, unknown>> = {
  [P in keyof T]: T[P] extends Record<string, unknown>
    ? DiffTree<T[P]>
    : "REMOVED" | "REPLACED" | "NOT_CHANGED";
};

const testDiffTree: DiffTree<Test> = {
  a: "NOT_CHANGED",
  b: "REPLACED",
  c: {
    ca: "REMOVED",
    cb: "REPLACED",
  },
};
 */
