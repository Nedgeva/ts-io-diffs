import prettier from 'prettier';
import * as ts from 'typescript';
import {
	isPrimitiveType,
	isStringIndexedObjectType,
	isRecordType,
	isNumberIndexedType,
	isTupleType,
	isArrayType,
	isObjectType,
	isAnyOrUnknown,
	isVoid,
	isFunctionType,
	isBasicObjectType,
	isLiteralType,
} from './type';
import { extractFlags } from './flags';
import { defaultConfig, TsToIoConfig, DEFAULT_FILE_NAME, getCliConfig, displayHelp } from './config';
import {
	diffUtils,
	generateCheckValueChangedInPathInterface,
	makeLookupForChangedPathUtils,
} from './comparer/comparer.utils';

interface Store {
	foundKeypaths: string[][];
	bufferKeypath: string[];
	activeIndex: number;
	deepestIndex: number;
	result: string[];
}

const createStore = (): Store => ({
	foundKeypaths: [],
	bufferKeypath: [],
	activeIndex: 0,
	deepestIndex: 0,
	result: [],
});

const processPropertyKey = (checker: ts.TypeChecker, store: Store) => (s: ts.Symbol) => {
	const { foundKeypaths, bufferKeypath, activeIndex } = store;

	const key = s.name;

	if (Array.isArray(foundKeypaths[activeIndex])) {
		foundKeypaths[activeIndex].push(...bufferKeypath, key);
	} else {
		foundKeypaths[activeIndex] = [];
		foundKeypaths[activeIndex].push(...bufferKeypath, key);
	}

	const nextSymbolType = checker.getTypeOfSymbolAtLocation(s, s.valueDeclaration);

	store.activeIndex++;

	if (isObjectType(nextSymbolType)) {
		bufferKeypath.push(key);
		const properties = checker.getPropertiesOfType(nextSymbolType);
		properties.forEach(processPropertyKey(checker, store));
		bufferKeypath.shift();
	}
};

const processProperty = (checker: ts.TypeChecker) => (s: ts.Symbol) => {
	return `${s.name}: ${processType(checker)(checker.getTypeOfSymbolAtLocation(s, s.valueDeclaration))}`;
};

const getOptimizedStringLiteralUnion = (type: ts.UnionType) => {
	const unionTypes = type.types as ts.StringLiteralType[];
	return `t.keyof({${unionTypes.map((t: ts.StringLiteralType) => `"${t.value}": null`).join(', ')}})`;
};

const processObjectType = (checker: ts.TypeChecker) => (type: ts.ObjectType) => {
	const properties = checker.getPropertiesOfType(type);
	const requiredProperties = properties.filter(p => !(p.valueDeclaration as ts.ParameterDeclaration).questionToken);
	const optionalProperties = properties.filter(p => (p.valueDeclaration as ts.ParameterDeclaration).questionToken);

	if (requiredProperties.length && optionalProperties.length) {
		return `t.intersection([t.type({${requiredProperties.map(
			processProperty(checker),
		)}}), t.partial({${optionalProperties.map(processProperty(checker)).join(', ')}})])`;
	} else if (optionalProperties.length === 0) {
		return `t.type({${requiredProperties.map(processProperty(checker)).join(', ')}})`;
	} else {
		return `t.partial({${optionalProperties.map(processProperty(checker)).join(', ')}})`;
	}
};

const processTypeForDiffPathBuilder = (checker: ts.TypeChecker, type: ts.Type, store: Store) => {
	if (isObjectType(type)) {
		const properties = checker.getPropertiesOfType(type);
		properties.forEach(processPropertyKey(checker, store));
	}
};

const processType = (checker: ts.TypeChecker) => (type: ts.Type): string => {
	if (isLiteralType(type)) {
		return 't.literal(' + checker.typeToString(type) + ')';
	} else if (isPrimitiveType(type)) {
		return 't.' + checker.typeToString(type);
	} else if (isBasicObjectType(type, checker)) {
		return `t.type({})`;
	} else if (isRecordType(type)) {
		const [key, value] = type.aliasTypeArguments!;
		return `t.record(${processType(checker)(key)}, ${processType(checker)(value)})`;
	} else if (type.isUnion()) {
		const isStringLiteralUnion = type.types.every(t => t.isStringLiteral());
		if (isStringLiteralUnion) {
			return getOptimizedStringLiteralUnion(type);
		}
		return `t.union([${type.types.map(processType(checker)).join(', ')}])`;
	} else if (type.isIntersection()) {
		return `t.intersection([${type.types.map(processType(checker)).join(', ')}])`;
	} else if (isTupleType(type, checker)) {
		if (type.hasRestElement) {
			console.warn('io-ts default validators do not support rest parameters in a tuple');
		}
		return `t.tuple([${(type as ts.TupleType).typeArguments!.map(processType(checker))}])`;
	} else if (isArrayType(type)) {
		return `t.array(${processType(checker)(type.getNumberIndexType()!)})`;
	} else if (isStringIndexedObjectType(type)) {
		return `t.record(t.string, ${processType(checker)(type.getStringIndexType()!)})`;
	} else if (isNumberIndexedType(type)) {
		return `t.record(t.number, ${processType(checker)(type.getNumberIndexType()!)})`;
	} else if (isFunctionType(type)) {
		return `t.Function`;
	} else if (isObjectType(type)) {
		return processObjectType(checker)(type);
	} else if (isVoid(type)) {
		return 't.void';
	} else if (isAnyOrUnknown(type)) {
		return 't.unknown';
	}
	throw Error('Unknown type with type flags: ' + extractFlags(type.flags));
};

function handleDeclarationForComparisonUtils(
	node: ts.TypeAliasDeclaration | ts.InterfaceDeclaration | ts.VariableStatement,
	checker: ts.TypeChecker,
	store: Store,
) {
	let symbol, type;
	try {
		if (node.kind === ts.SyntaxKind.VariableStatement) {
			symbol = checker.getSymbolAtLocation(node.declarationList.declarations[0].name);
			type = checker.getTypeOfSymbolAtLocation(symbol!, symbol!.valueDeclaration!);
		} else {
			symbol = checker.getSymbolAtLocation(node.name);
			type = checker.getTypeAtLocation(node);
		}

		// TODO: move out repetetive code
		store.foundKeypaths = [];
		store.bufferKeypath = [];
		store.activeIndex = 0;

		processTypeForDiffPathBuilder(checker, type, store);

		const currentIterationDeepestIndex = store.foundKeypaths.reduce(
			(acc, v) => (v.length > acc ? v.length : acc),
			0,
		);
		store.deepestIndex = Math.max(store.deepestIndex, currentIterationDeepestIndex);

		return makeLookupForChangedPathUtils(store.foundKeypaths, symbol!.name);
	} catch (e) {
		return `// Error: Failed to generate a codec for ${symbol ? symbol.name : ''}`;
	}
}

function handleDeclaration(
	node: ts.TypeAliasDeclaration | ts.InterfaceDeclaration | ts.VariableStatement,
	checker: ts.TypeChecker,
) {
	let symbol, type;
	try {
		if (node.kind === ts.SyntaxKind.VariableStatement) {
			symbol = checker.getSymbolAtLocation(node.declarationList.declarations[0].name);
			type = checker.getTypeOfSymbolAtLocation(symbol!, symbol!.valueDeclaration!);
		} else {
			symbol = checker.getSymbolAtLocation(node.name);
			type = checker.getTypeAtLocation(node);
		}

		return `const ${symbol!.name} = ` + processType(checker)(type);
	} catch (e) {
		return `// Error: Failed to generate a codec for ${symbol ? symbol.name : ''}`;
	}
}

const visit = (checker: ts.TypeChecker, config: TsToIoConfig, store: Store) => (node: ts.Node) => {
	if (!config.followImports && !config.fileNames.includes(node.getSourceFile().fileName)) {
		return;
	}
	if (ts.isTypeAliasDeclaration(node) || ts.isVariableStatement(node) || ts.isInterfaceDeclaration(node)) {
		store.result.push(handleDeclaration(node, checker));
		store.result.push(handleDeclarationForComparisonUtils(node, checker, store));
	} else if (ts.isModuleDeclaration(node)) {
		ts.forEachChild(node, visit(checker, config, store));
	}
};

const getImports = () => {
	return `import * as t from "io-ts"`;
};

const compilerOptions: ts.CompilerOptions = {
	strictNullChecks: true,
};

export function getValidatorsFromString(source: string, config = { ...defaultConfig, fileNames: [DEFAULT_FILE_NAME] }) {
	const defaultCompilerHostOptions = ts.createCompilerHost({});

	const compilerHostOptions = {
		...defaultCompilerHostOptions,
		getSourceFile: (filename: string, languageVersion: ts.ScriptTarget, ...restArgs: any[]) => {
			if (filename === DEFAULT_FILE_NAME)
				return ts.createSourceFile(filename, source, ts.ScriptTarget.ES2015, true);
			else return defaultCompilerHostOptions.getSourceFile(filename, languageVersion, ...restArgs);
		},
	};

	// @mutable
	const store = createStore();

	const program = ts.createProgram([DEFAULT_FILE_NAME], compilerOptions, compilerHostOptions);
	const checker = program.getTypeChecker();

	ts.forEachChild(program.getSourceFile(DEFAULT_FILE_NAME)!, visit(checker, config, store));
	return store.result.join('\n\n');
}

export function getValidatorsFromFileNames() {
	const config = getCliConfig();

	if (!config.fileNames.length) {
		return displayHelp();
	}

	const program = ts.createProgram(config.fileNames, compilerOptions);
	const checker = program.getTypeChecker();

	// @mutable
	const store = createStore();

	for (const sourceFile of program.getSourceFiles()) {
		if (!sourceFile.isDeclarationFile) {
			ts.forEachChild(sourceFile, visit(checker, config, store));
		}
	}

	// if (config.includeDiffCheck) {

	store.result.unshift(generateCheckValueChangedInPathInterface(store.deepestIndex));

	store.result.unshift(diffUtils);

	if (config.includeHeader) {
		store.result.unshift(getImports());
	}

	return prettier.format(store.result.join('\n\n'), { parser: 'typescript' });
}
