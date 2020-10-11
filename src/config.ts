import program from 'commander';

export function getCliConfig(): TsToIoConfig {
	program
		.name('ts-io-diffs')
		.version('0.0.1')
		.option('--follow-imports', 'output codecs for types declared in imported files')
		.option('--no-include-header', 'omit io-ts import from the output')
		.option('--no-diff-check-utils', "don't generate diff check utils")
		.arguments('<files>');

	program.parse(process.argv);

	return {
		...program.opts(),
		fileNames: program.args,
	} as TsToIoConfig;
}

export function displayHelp() {
	return program.help();
}

export const DEFAULT_FILE_NAME = 'io-ts-diffs.ts';

export interface TsToIoConfig {
	followImports: boolean;
	includeHeader: boolean;
	diffCheckUtils: boolean;
	fileNames: string[];
}

export const defaultConfig: TsToIoConfig = {
	followImports: false,
	includeHeader: true,
	diffCheckUtils: true,
	fileNames: [],
};
