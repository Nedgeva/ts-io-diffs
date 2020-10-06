const mapNonNullableKeys = (i: number): string =>
	i > 1 ? `NonNullable<${mapNonNullableKeys(i - 1)}${i > 0 ? '' : '>'}[K${i}]>` : 'NonNullable<S[K1]>';

const generateCheckValueChangedInPathInterfaceOverloads = (overloads: number) =>
	`<${[...Array(overloads)]
		.map((_, i) => (i > 0 ? `K${i + 1} extends keyof ${mapNonNullableKeys(i)}` : `K1 extends keyof S`))
		.join(',\n')}>(path: [${[...Array(overloads)].map((_, i) => `K${i + 1}`).join(', ')}]): O;`;

export const generateCheckValueChangedInPathInterface = (overloads: number) =>
	`interface CheckValueChangedInPath<S, O> {
		${[...Array(overloads)].map((_, i) => generateCheckValueChangedInPathInterfaceOverloads(overloads - i)).join('\n')}
}`;

export const makeLookupForChangedPathUtils = (allKeyPaths: string[][], codecName: string) =>
	`const diffPathsFor${codecName} = getPathsOfChangedValues(${codecName}.asEncoder(), prev${codecName}, current${codecName});
	const lookupForChangedPathsIn${codecName} = checkIfValueChangedInRootPath<t.OutputOf<typeof ${codecName}>>(diffPathsFor${codecName});\n` +
	allKeyPaths
		.map(
			keyPaths =>
				`const is${keyPaths.join(
					'',
				)}In${codecName}Changed = lookupForChangedPathsIn${codecName}(['${keyPaths.join("', '")}'])`,
		)
		.join('\n');

export const diffUtils = `
import { Operation, ReplaceOperation, compare } from 'fast-json-patch';
import { Predicate, constant } from 'fp-ts/lib/function';
import { getOrElse, none, some } from 'fp-ts/lib/Option';
import { array } from 'fp-ts';
import { pipe } from 'fp-ts/lib/pipeable';

const getOrConstant = <A>(a: A) => getOrElse(constant<A>(a));
const isBlank: Predicate<string> = value => !value.trim().length;

const isReplaceOperation = (op: Operation): op is ReplaceOperation<unknown> => op.op === 'replace';

export const getPathsOfEncodedChangedValues = <T>(prevValue: T, currValue: T): string[] =>
	compare(prevValue, currValue)
		.filter(operation => operation.op === 'replace')
		.map(operation => operation.path);

export const getPathsOfChangedValues = <T, O>(encoder: t.Encoder<T, O>, prevValue: T, currValue: T): string[] => {
	// restore original JSON representation of model
	const prevValueEncoded = encoder.encode(prevValue);
	const currValueEncoded = encoder.encode(currValue);

	return getPathsOfEncodedChangedValues(prevValueEncoded, currValueEncoded);
};

const getPatchesOfChangedValues = <T, O>(
	encoder: t.Encoder<T, O>,
	prevValue: T,
	currValue: T,
): ReplaceOperation<unknown>[] => {
	// restore original JSON representation of model
	const prevValueEncoded = encoder.encode(prevValue);
	const currValueEncoded = encoder.encode(currValue);

	return pipe(
		compare(prevValueEncoded, currValueEncoded),
		array.filter(isReplaceOperation),
	);
};

export type ChangeType = 'NO_CHANGES_FOUND' | 'REPLACED' | 'REMOVED';

const getKeyPaths = (keys: unknown[]) => \`/\${keys.join('/')}\`;

export const checkIfValueChangedInRootPath = <S>(paths: string[]): CheckValueChangedInPath<S, boolean> => (
	keys: unknown[],
) => paths.some(path => path.startsWith(getKeyPaths(keys)));

export const checkIfValueChangedInPath = <S>(paths: string[]): CheckValueChangedInPath<S, boolean> => (
	keys: unknown[],
) => paths.includes(getKeyPaths(keys));

const checkIsValueNullOrEmptyString = (value: unknown) =>
	value === null || (typeof value === 'string' && isBlank(value));

// TODO: needs heavy testing
export const getChangeTypeOfChangedValueInPath = <S>(
	ops: ReplaceOperation<unknown>[],
	checkIsValueChanged = checkIsValueNullOrEmptyString,
): CheckValueChangedInPath<S, ChangeType> => (keys: unknown[]) => {
	const findChangeTypeByKeys = (keys: unknown[]): ChangeType =>
		pipe(
			ops,
			array.findFirstMap(op => {
				if (!keys.length) {
					return some<ChangeType>('REPLACED');
				}

				const keyPath = getKeyPaths(keys);

				return op.path.startsWith(keyPath)
					? op.path === keyPath
						? checkIsValueChanged(op.value)
							? some<ChangeType>('REMOVED')
							: some<ChangeType>('REPLACED')
						: some<ChangeType>(findChangeTypeByKeys(keys.slice(0, -1)))
					: keys.length > 1
					? some(findChangeTypeByKeys(keys.slice(0, -1)))
					: none;
			}),
			getOrConstant<ChangeType>('NO_CHANGES_FOUND'),
		);

	return findChangeTypeByKeys(keys);
};
`;
