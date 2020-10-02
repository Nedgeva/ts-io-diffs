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

export const diffUtils = `
import { Operation, ReplaceOperation, compare } from 'fast-json-patch';
import { Predicate, constant } from 'fp-ts/lib/function';
import { getOrElse, none, some } from 'fp-ts/lib/Option';
import { array } from 'fp-ts';
import { pipe } from 'fp-ts/lib/pipeable';
import { Encoder } from 'io-ts';

const getOrConstant = <A>(a: A) => getOrElse(constant<A>(a));
const isBlank: Predicate<string> = value => !value.trim().length;

const isReplaceOperation = (op: Operation): op is ReplaceOperation<unknown> => op.op === 'replace';

const getPatchesOfChangedValues = <T, O>(
	encoder: Encoder<T, O>,
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

export const checkIfValueChangedInPath = <S>(paths: string[]): CheckValueChangedInPath<S, boolean> => (
	keys: unknown[],
) => paths.includes(getKeyPaths(keys));

const checkIsValueNullOrEmptyString = (value: unknown) =>
	value === null || (typeof value === 'string' && isBlank(value));

export const getChangeTypeOfChangedValueInPath = <S>(
	ops: ReplaceOperation<unknown>[],
	checkIsValueChanged = checkIsValueNullOrEmptyString,
): CheckValueChangedInPath<S, ChangeType> => (keys: unknown[]) =>
	pipe(
		ops,
		array.findFirstMap(op =>
			op.path === getKeyPaths(keys)
				? checkIsValueChanged(op.value)
					? some<ChangeType>('REMOVED')
					: some<ChangeType>('REPLACED')
				: none,
		),
		getOrConstant<ChangeType>('NO_CHANGES_FOUND'),
	);
`;
