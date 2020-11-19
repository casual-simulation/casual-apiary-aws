module.exports = {
    preset: 'ts-jest/presets/js-with-babel',
    testEnvironment: './jest/test_environment.js',
    moduleFileExtensions: ['ts', 'tsx', 'js'],
    testPathIgnorePatterns: [
        '/node_modules/',
        '/temp/',
        '/lib/',
        '/dist/',
        '<rootDir>/.dynamodb',
        '<rootDir>/.s3',
        '<rootDir>/.webpack',
        '<rootDir>/.serverless',
    ],
    watchPathIgnorePatterns: [
        '/node_modules/',
        '<rootDir>/.dynamodb',
        '<rootDir>/.s3',
        '<rootDir>/.webpack',
        '<rootDir>/.serverless',
    ],
    moduleNameMapper: {},
    transformIgnorePatterns: [
        'node_modules/(?!(@casual-simulation)/)',
        '<rootDir>/.dynamodb',
        '<rootDir>/.s3',
        '<rootDir>/.webpack',
        '<rootDir>/.serverless',
    ],
    globals: {
        'ts-jest': {
            diagnostics: {
                ignoreCodes: [6133, 6138],
            },
        },
    },
};
